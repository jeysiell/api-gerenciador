const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config();



const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;

// Configuração do CORS
app.use(cors());

// Serve arquivos estáticos da pasta public
app.use('/perfis', express.static(path.join(__dirname, 'public/perfis')));

// Configuração do banco de dados
const connection = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Testar conexão com o banco
connection.getConnection((err, conn) => {
  if (err) {
    console.error('❌ Erro de conexão:', err);
    return;
  }
  console.log('✅ Conectado ao banco de dados!');
  conn.release();
});

app.use(express.json());

// Rota de status
app.get('/', (req, res) => {
  res.json({
    status: 'API online',
    database: process.env.DB_NAME ? 'Conectado' : 'Não configurado'
  });
});

// Buscar todos os usuários ativos
app.get('/usuarios', async (req, res) => {
  try {
    const [results] = await connection.promise().query(
      'SELECT id, nome, telefone, status FROM usuarios'
    );

    // Adiciona a url da imagem de perfil (ou imagem padrão caso não exista)
    const usuariosComFoto = results.map(u => ({
      ...u,
      fotoUrl: `/perfis/${u.id}.jpg` // pode ajustar extensão conforme seu arquivo
    }));

    res.json(usuariosComFoto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});


// Criar novo usuário com validação de nome e telefone
app.post('/usuarios', async (req, res) => {
  let { nome, telefone, senha } = req.body;

  if (!nome || !telefone || !senha) {
    return res.status(400).json({ 
      error: 'Nome, telefone e senha são obrigatórios'
    });
  }

  // Formatar nome (primeira letra de cada palavra maiúscula)
  nome = nome
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim();

  // Remover caracteres não numéricos do telefone
  telefone = telefone.replace(/\D/g, '');

  // Validar telefone: deve ter 10 ou 11 dígitos (DDD + número)
  if (!/^(\d{10}|\d{11})$/.test(telefone)) {
    return res.status(400).json({ 
      error: 'Telefone inválido. Use DDD seguido de 8 ou 9 dígitos, ex: 11912345678'
    });
  }

  try {
    const hash = await bcrypt.hash(senha, saltRounds);

    const [result] = await connection.promise().query(
      'INSERT INTO usuarios (nome, telefone, senha) VALUES (?, ?, ?)',
      [nome, telefone, hash]
    );

    res.status(201).json({
      id: result.insertId,
      nome,
      telefone,
      status: 1
    });
  } catch (err) {
    console.error(err);

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Telefone já cadastrado' });
    }

    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});


// Atualizar status do usuário
app.patch('/usuarios/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const [result] = await connection.promise().query(
      'UPDATE usuarios SET status = ? WHERE id = ?',
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ id, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

app.put('/usuarios/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const [result] = await connection.promise().query(
      'UPDATE usuarios SET status = ? WHERE id = ?',
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ id, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});


// Rota de login
app.post('/login', async (req, res) => {
  const { telefone, senha } = req.body;

  if (!telefone || !senha) {
    return res.status(400).json({ error: 'Telefone e senha são obrigatórios' });
  }

  try {
    const [results] = await connection.promise().query(
      'SELECT id, nome, telefone, senha, status FROM usuarios WHERE telefone = ?',
      [telefone]
    );

    if (results.length === 0) {
      return res.status(401).json({ error: 'Telefone não cadastrado' });
    }

    const usuario = results[0];
    
    // Verificar se o usuário está ativo
    if (!usuario.status) {
      return res.status(403).json({ error: 'Usuário inativo' });
    }

    // Comparar senha com o hash armazenado
    const match = await bcrypt.compare(senha, usuario.senha);
    
    if (match) {
      // Remover a senha do objeto antes de retornar
      delete usuario.senha;
      res.json(usuario);
    } else {
      res.status(401).json({ error: 'Senha incorreta' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// rota put para editar usuarios
app.put('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, senha } = req.body;

  try {
    let hash;
    if (senha) {
      hash = await bcrypt.hash(senha, saltRounds);
    }

    const [result] = await connection.promise().query(
      'UPDATE usuarios SET nome = ?, telefone = ?, senha = ? WHERE id = ?',
      [nome, telefone, hash || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ id, nome, telefone });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// Excluir usuário
app.delete('/usuarios/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await connection.promise().query(
      'DELETE FROM usuarios WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
});


// Atualizar dados do usuário
app.patch('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, senha } = req.body;

  try {
    // Criptografar a nova senha se fornecida
    let hash;
    if (senha) {
      hash = await bcrypt.hash(senha, saltRounds);
    }

    const [result] = await connection.promise().query(
      'UPDATE usuarios SET nome = ?, telefone = ?, senha = ? WHERE id = ?',
      [nome, telefone, hash || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ id, nome, telefone });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});


// Lidar com erros 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Lidar com erros globais
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno no servidor' });
});

// Iniciar servidor
const server = app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});

// Encerrar conexões corretamente ao fechar
process.on('SIGTERM', () => {
  server.close(() => {
    connection.end();
    console.log('Servidor encerrado');
  });
});
