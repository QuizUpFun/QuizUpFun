import express from "express";
import cors from "cors";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const app = express();

app.use(cors());
app.use(express.json());

// =====================================================
// CONFIGURAÇÃO DO POSTGRESQL
// =====================================================

if (!process.env.DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não foi configurada.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// =====================================================
// ROTA PRINCIPAL
// =====================================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "QuizUp Admin Backend funcionando!"
  });
});

// =====================================================
// TESTE DO BANCO
// =====================================================

app.get("/api/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      status: "ok",
      database: "conectado",
      time: result.rows[0].now
    });
  } catch (error) {
    console.error("ERRO POSTGRES:", error);

    res.status(500).json({
      status: "error",
      message: "Erro ao conectar ao PostgreSQL",
      code: error.code,
      detail: error.message
    });
  }
});

// =====================================================
// CRIAR TABELA DE ADMINS
// =====================================================

async function criarTabelaAdmins() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        senha VARCHAR(255) NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Tabela admins pronta.");
  } catch (error) {
    console.error("Erro ao criar tabela admins:", error);
  }
}

// =====================================================
// CRIAR PRIMEIRO ADMINISTRADOR
// =====================================================
//
// Esta rota só funciona se:
// 1. ADMIN_SETUP_KEY estiver configurada no Render
// 2. Ainda não existir nenhum administrador
//
// Depois de criar o primeiro administrador,
// recomendamos apagar ADMIN_SETUP_KEY do Render.
//

app.post("/api/admin/setup", async (req, res) => {
  try {
    const { setupKey, email, password } = req.body;

    // Verifica a chave secreta
    if (!process.env.ADMIN_SETUP_KEY) {
      return res.status(500).json({
        status: "error",
        message: "ADMIN_SETUP_KEY não configurada no servidor."
      });
    }

    if (setupKey !== process.env.ADMIN_SETUP_KEY) {
      return res.status(403).json({
        status: "error",
        message: "Chave de configuração inválida."
      });
    }

    // Validação dos dados
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "E-mail e senha são obrigatórios."
      });
    }

    const emailNormalizado = email.toLowerCase().trim();

    if (password.length < 8) {
      return res.status(400).json({
        status: "error",
        message: "A senha precisa ter pelo menos 8 caracteres."
      });
    }

    // Verifica se já existe administrador
    const quantidade = await pool.query(
      "SELECT COUNT(*)::int AS total FROM admins"
    );

    if (quantidade.rows[0].total > 0) {
      return res.status(409).json({
        status: "error",
        message: "O primeiro administrador já foi criado."
      });
    }

    // Criptografa a senha
    const senhaHash = await bcrypt.hash(password, 12);

    // Cria o administrador
    const result = await pool.query(
      `
      INSERT INTO admins (email, senha)
      VALUES ($1, $2)
      RETURNING id, email, criado_em
      `,
      [emailNormalizado, senhaHash]
    );

    res.status(201).json({
      status: "ok",
      message: "Administrador criado com sucesso.",
      admin: result.rows[0]
    });

  } catch (error) {
    console.error("Erro ao criar administrador:", error);

    res.status(500).json({
      status: "error",
      message: "Erro interno ao criar administrador."
    });
  }
});

// =====================================================
// LOGIN DO ADMINISTRADOR
// =====================================================

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validação
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "E-mail e senha são obrigatórios."
      });
    }

    const emailNormalizado = email.toLowerCase().trim();

    // Procura o administrador
    const result = await pool.query(
      `
      SELECT id, email, senha, criado_em
      FROM admins
      WHERE email = $1
      `,
      [emailNormalizado]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: "error",
        message: "E-mail ou senha incorretos."
      });
    }

    const admin = result.rows[0];

    // Compara a senha digitada com o hash armazenado
    const senhaCorreta = await bcrypt.compare(
      password,
      admin.senha
    );

    if (!senhaCorreta) {
      return res.status(401).json({
        status: "error",
        message: "E-mail ou senha incorretos."
      });
    }

    // Login realizado
    res.json({
      status: "ok",
      message: "Login realizado com sucesso.",
      admin: {
        id: admin.id,
        email: admin.email,
        criado_em: admin.criado_em
      }
    });

  } catch (error) {
    console.error("Erro no login:", error);

    res.status(500).json({
      status: "error",
      message: "Erro interno no servidor."
    });
  }
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`QuizUp Admin Backend rodando na porta ${PORT}`);

  await criarTabelaAdmins();
});
