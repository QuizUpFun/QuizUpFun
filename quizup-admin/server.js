import express from "express";
import cors from "cors";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const app = express();

// =====================================================
// MIDDLEWARES
// =====================================================

app.use(cors());
app.use(express.json());

// =====================================================
// VERIFICAR DATABASE_URL
// =====================================================

if (!process.env.DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não foi configurada.");
  process.exit(1);
}

// =====================================================
// CONEXÃO COM POSTGRESQL
// =====================================================

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
// TESTAR BANCO DE DADOS
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
    console.error(
      "Erro ao criar tabela admins:",
      error
    );
  }
}

// =====================================================
// CRIAR PRIMEIRO ADMINISTRADOR
// =====================================================

app.post("/api/admin/setup", async (req, res) => {
  try {
    const {
      setupKey,
      email,
      password
    } = req.body;

    if (!process.env.ADMIN_SETUP_KEY) {
      return res.status(500).json({
        status: "error",
        message:
          "ADMIN_SETUP_KEY não configurada no servidor."
      });
    }

    if (setupKey !== process.env.ADMIN_SETUP_KEY) {
      return res.status(403).json({
        status: "error",
        message:
          "Chave de configuração inválida."
      });
    }

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message:
          "E-mail e senha são obrigatórios."
      });
    }

    const emailNormalizado =
      email.toLowerCase().trim();

    if (password.length < 8) {
      return res.status(400).json({
        status: "error",
        message:
          "A senha precisa ter pelo menos 8 caracteres."
      });
    }

    const quantidade = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM admins
    `);

    if (quantidade.rows[0].total > 0) {
      return res.status(409).json({
        status: "error",
        message:
          "O primeiro administrador já foi criado."
      });
    }

    const senhaHash =
      await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
      INSERT INTO admins
      (email, senha)
      VALUES ($1, $2)
      RETURNING
        id,
        email,
        criado_em
      `,
      [
        emailNormalizado,
        senhaHash
      ]
    );

    res.status(201).json({
      status: "ok",
      message:
        "Administrador criado com sucesso.",
      admin: result.rows[0]
    });

  } catch (error) {
    console.error(
      "Erro ao criar administrador:",
      error
    );

    res.status(500).json({
      status: "error",
      message:
        "Erro interno ao criar administrador."
    });
  }
});

// =====================================================
// LOGIN DO ADMINISTRADOR
// =====================================================

app.post("/api/admin/login", async (req, res) => {
  try {
    const {
      email,
      password
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message:
          "E-mail e senha são obrigatórios."
      });
    }

    const emailNormalizado =
      email.toLowerCase().trim();

    const result = await pool.query(
      `
      SELECT
        id,
        email,
        senha,
        criado_em
      FROM admins
      WHERE email = $1
      `,
      [emailNormalizado]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: "error",
        message:
          "E-mail ou senha incorretos."
      });
    }

    const admin = result.rows[0];

    const senhaCorreta =
      await bcrypt.compare(
        password,
        admin.senha
      );

    if (!senhaCorreta) {
      return res.status(401).json({
        status: "error",
        message:
          "E-mail ou senha incorretos."
      });
    }

    res.json({
      status: "ok",
      message:
        "Login realizado com sucesso.",
      admin: {
        id: admin.id,
        email: admin.email,
        criado_em:
          admin.criado_em
      }
    });

  } catch (error) {
    console.error(
      "Erro no login:",
      error
    );

    res.status(500).json({
      status: "error",
      message:
        "Erro interno no servidor."
    });
  }
});

// =====================================================
// DADOS DO DASHBOARD
// =====================================================

app.get("/api/admin/dashboard", async (req, res) => {
  try {

    // TOTAL DE JOGADORES
    const jogadoresResult =
      await pool.query(`
        SELECT COUNT(*)::int AS total
        FROM jogadores
      `);

    // TOTAL DE PONTOS
    const pontosResult =
      await pool.query(`
        SELECT
          COALESCE(
            SUM(pontos),
            0
          )::bigint AS total
        FROM jogadores
      `);

    // SAQUES PENDENTES
    const saquesPendentesResult =
      await pool.query(`
        SELECT COUNT(*)::int AS total
        FROM saques
        WHERE LOWER(status) = 'pendente'
      `);

    // VALOR DOS SAQUES PENDENTES
    const valorSaquesResult =
      await pool.query(`
        SELECT
          COALESCE(
            SUM(quantia),
            0
          ) AS total
        FROM saques
        WHERE LOWER(status) = 'pendente'
      `);

    res.json({
      status: "ok",

      dashboard: {
        jogadores:
          jogadoresResult.rows[0].total,

        pontos:
          pontosResult.rows[0].total,

        saquesPendentes:
          saquesPendentesResult.rows[0].total,

        valorSaques:
          Number(
            valorSaquesResult.rows[0].total
          )
      }
    });

  } catch (error) {

    console.error(
      "Erro ao carregar dashboard:",
      error
    );

    res.status(500).json({
      status: "error",

      message:
        "Erro ao carregar dados do dashboard.",

      detail:
        error.message
    });
  }
});

// =====================================================
// LISTAR JOGADORES
// =====================================================

app.get("/api/admin/jogadores", async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT *
      FROM jogadores
      ORDER BY id DESC
    `);

    res.json({
      status: "ok",
      jogadores: result.rows
    });

  } catch (error) {

    console.error(
      "Erro ao carregar jogadores:",
      error
    );

    res.status(500).json({
      status: "error",
      message:
        "Erro ao carregar jogadores.",
      detail:
        error.message
    });
  }
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  async () => {

    console.log(
      `QuizUp Admin Backend rodando na porta ${PORT}`
    );

    await criarTabelaAdmins();
  }
);
