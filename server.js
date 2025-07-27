const express = require('express');
const mysql = require('mysql2');
const cors = require('cors'); 
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configuração do CORS
app.use(cors()); 

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

// Buscar todos os usuários
app.get('/usuarios', async (req, res) => {
  try {
    const [results] = await connection.promise().query('SELECT * FROM usuarios');
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// Criar novo usuário
app.post('/usuarios', async (req, res) => {
  const { nome, email } = req.body;

  if (!nome || !email) {
    return res.status(400).json({ error: 'Nome e email são obrigatórios' });
  }

  try {
    const [result] = await connection.promise().query(
      'INSERT INTO usuarios (nome, email) VALUES (?, ?)',
      [nome, email]
    );
    
    const novoUsuario = {
      id: result.insertId,
      nome,
      email
    };
    
    res.status(201).json(novoUsuario);
  } catch (err) {
    console.error(err);
    
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }
    
    res.status(500).json({ error: 'Erro ao criar usuário' });
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
