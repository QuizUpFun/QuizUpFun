const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ===============================
// TESTE DO SERVIDOR
// ===============================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "QuizUp Admin Backend funcionando!"
  });
});

// ===============================
// TESTE DO BANCO
// ===============================

app.get("/api/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS time");

    res.json({
      status: "ok",
      time: result.rows[0].time
    });
  } catch (error) {
    console.error("Erro no banco:", error);

    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});

// ===============================
// CRIAR TABELAS NECESSÁRIAS
// ===============================

async function prepararBanco() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        senha VARCHAR(255) NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tabela admins pronta.");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS jogadores (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        cpf VARCHAR(50),
        codigo_de_indicacao VARCHAR(100),
        pontos INTEGER DEFAULT 0,
        saldo NUMERIC(10,2) DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tabela jogadores verificada.");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS perguntas (
        id SERIAL PRIMARY KEY,
        pergunta TEXT NOT NULL,
        resposta_a TEXT,
        resposta_b TEXT,
        resposta_c TEXT,
        resposta_d TEXT,
        resposta_correta VARCHAR(1),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tabela perguntas verificada.");

  } catch (error) {
    console.error("Erro ao preparar banco:", error);
  }
}

// ===============================
// LOGIN ADMINISTRATIVO
// ===============================

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "E-mail e senha são obrigatórios."
      });
    }

    const result = await pool.query(
      "SELECT * FROM admins WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "E-mail ou senha incorretos."
      });
    }

    const admin = result.rows[0];

    const senhaCorreta = await bcrypt.compare(
      senha,
      admin.senha
    );

    if (!senhaCorreta) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "E-mail ou senha incorretos."
      });
    }

    res.json({
      sucesso: true,
      mensagem: "Login realizado com sucesso!",
      admin: {
        id: admin.id,
        email: admin.email
      }
    });

  } catch (error) {
    console.error("Erro no login:", error);

    res.status(500).json({
      sucesso: false,
      mensagem: "Erro interno do servidor."
    });
  }
});

// ===============================
// LISTAR JOGADORES
// ===============================

app.get("/api/jogadores", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        nome,
        email,
        cpf,
        codigo_de_indicacao,
        pontos,
        saldo,
        criado_em
      FROM jogadores
      ORDER BY id DESC
    `);

    res.json(result.rows);

  } catch (error) {
    console.error("Erro ao buscar jogadores:", error);

    res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao buscar jogadores."
    });
  }
});

// ===============================
// LISTAR PERGUNTAS
// ===============================

app.get("/api/perguntas", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM perguntas
      ORDER BY id DESC
    `);

    res.json(result.rows);

  } catch (error) {
    console.error("Erro ao buscar perguntas:", error);

    res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao buscar perguntas."
    });
  }
});

// ===============================
// INICIAR
// ===============================

async function iniciar() {
  await prepararBanco();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`QuizUp Admin Backend rodando na porta ${PORT}`);
  });
}

iniciar();
