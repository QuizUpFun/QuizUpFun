const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não configurada.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ======================================================
// BANCO
// ======================================================

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
      ALTER TABLE jogadores
      ADD COLUMN IF NOT EXISTS pontos BIGINT DEFAULT 0
    `);

    await pool.query(`
      ALTER TABLE jogadores
      ADD COLUMN IF NOT EXISTS equilibrio NUMERIC DEFAULT 0
    `);

    await pool.query(`
      ALTER TABLE jogadores
      ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    console.log("Tabela jogadores verificada.");

  } catch (erro) {
    console.error("Erro ao preparar banco:", erro);
  }
}

// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================

function limparCPF(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function gerarCodigo() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ======================================================
// TESTE
// ======================================================

app.get("/", (req, res) => {
  res.json({
    sucesso: true,
    mensagem: "QuizUp Admin Backend funcionando."
  });
});

app.get("/api/test-db", async (req, res) => {
  try {
    const resultado = await pool.query("SELECT NOW() AS agora");

    res.json({
      sucesso: true,
      banco: "conectado",
      agora: resultado.rows[0].agora
    });

  } catch (erro) {
    console.error("Erro teste banco:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao conectar ao banco."
    });
  }
});

// ======================================================
// CADASTRO
// ======================================================

app.post("/api/cadastro", async (req, res) => {
  try {
    const {
      email,
      senha,
      nome,
      cpf,
      codigo_indicacao
    } = req.body;

    if (!email || !senha || !nome || !cpf) {
      return res.status(400).json({
        sucesso: false,
        erro: "Preencha todos os campos."
      });
    }

    const emailNormalizado = String(email).trim().toLowerCase();
    const cpfLimpo = limparCPF(cpf);

    if (cpfLimpo.length !== 11) {
      return res.status(400).json({
        sucesso: false,
        erro: "CPF inválido."
      });
    }

    if (senha.length < 6) {
      return res.status(400).json({
        sucesso: false,
        erro: "A senha deve ter pelo menos 6 caracteres."
      });
    }

    const existente = await pool.query(
      `
      SELECT id
      FROM jogadores
      WHERE LOWER(email) = $1
         OR cpf = $2
      LIMIT 1
      `,
      [emailNormalizado, cpfLimpo]
    );

    if (existente.rows.length > 0) {
      return res.status(409).json({
        sucesso: false,
        erro: "E-mail ou CPF já cadastrado."
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const codigo = gerarCodigo();

    const resultado = await pool.query(
      `
      INSERT INTO jogadores
      (
        email,
        senha,
        nome,
        cpf,
        codigo_indicacao,
        pontos,
        equilibrio,
        criado_em
      )
      VALUES
      ($1, $2, $3, $4, $5, 0, 0, CURRENT_TIMESTAMP)
      RETURNING
        id,
        email,
        nome,
        cpf,
        codigo_indicacao,
        pontos,
        equilibrio,
        criado_em
      `,
      [
        emailNormalizado,
        senhaHash,
        nome.trim(),
        cpfLimpo,
        codigo
      ]
    );

    res.json({
      sucesso: true,
      jogador: resultado.rows[0]
    });

  } catch (erro) {
    console.error("Erro cadastro:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao realizar cadastro."
    });
  }
});

// ======================================================
// LOGIN
// ======================================================

app.post("/api/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        sucesso: false,
        erro: "Informe e-mail e senha."
      });
    }

    const emailNormalizado = String(email).trim().toLowerCase();

    const resultado = await pool.query(
      `
      SELECT *
      FROM jogadores
      WHERE LOWER(email) = $1
      LIMIT 1
      `,
      [emailNormalizado]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        sucesso: false,
        erro: "E-mail ou senha incorretos."
      });
    }

    const jogador = resultado.rows[0];

    const senhaCorreta = await bcrypt.compare(
      senha,
      jogador.senha
    );

    if (!senhaCorreta) {
      return res.status(401).json({
        sucesso: false,
        erro: "E-mail ou senha incorretos."
      });
    }

    delete jogador.senha;

    res.json({
      sucesso: true,
      jogador
    });

  } catch (erro) {
    console.error("Erro login:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao realizar login."
    });
  }
});

//
