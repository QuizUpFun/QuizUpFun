const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ===============================
// INÍCIO
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
    const result = await pool.query("SELECT NOW() AS agora");

    res.json({
      status: "ok",
      banco: "conectado",
      hora: result.rows[0].agora
    });
  } catch (erro) {
    console.error("Erro no banco:", erro);

    res.status(500).json({
      status: "erro",
      erro: erro.message
    });
  }
});

// ===============================
// PREPARAR BANCO
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

    // Garante que perguntas antigas também tenham dificuldade
    await pool.query(`
      ALTER TABLE perguntas
      ADD COLUMN IF NOT EXISTS dificuldade VARCHAR(10) DEFAULT 'facil'
    `);

    // Garante que jogadores tenham saldo
    await pool.query(`
      ALTER TABLE jogadores
      ADD COLUMN IF NOT EXISTS saldo NUMERIC(10,2) DEFAULT 0
    `);

    // Índice para buscas rápidas por dificuldade
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_perguntas_dificuldade
      ON perguntas (dificuldade)
    `);

    console.log("Tabela admins pronta.");
    console.log("Tabela jogadores verificada.");
    console.log("Tabela perguntas verificada.");
  } catch (erro) {
    console.error("Erro ao preparar banco:", erro);
  }
}

// ===============================
// LOGIN ADMIN
// ===============================

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        sucesso: false,
        erro: "E-mail e senha são obrigatórios."
      });
    }

    const resultado = await pool.query(
      "SELECT * FROM admins WHERE email = $1 LIMIT 1",
      [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        sucesso: false,
        erro: "E-mail ou senha incorretos."
      });
    }

    const admin = resultado.rows[0];

    const senhaCorreta = await bcrypt.compare(
      senha,
      admin.senha
    );

    if (!senhaCorreta) {
      return res.status(401).json({
        sucesso: false,
        erro: "E-mail ou senha incorretos."
      });
    }

    res.json({
      sucesso: true,
      mensagem: "Login realizado com sucesso.",
      admin: {
        id: admin.id,
        email: admin.email
      }
    });

  } catch (erro) {
    console.error("Erro no login:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro interno no servidor."
    });
  }
});

// ===============================
// DASHBOARD
// ===============================

app.get("/api/admin/dashboard", async (req, res) => {
  try {
    const jogadores = await pool.query(`
      SELECT COUNT(*) AS total
      FROM jogadores
    `);

    const pontos = await pool.query(`
      SELECT COALESCE(SUM(pontos), 0) AS total
      FROM jogadores
    `);

    const saldo = await pool.query(`
      SELECT COALESCE(SUM(saldo), 0) AS total
      FROM jogadores
    `);

    res.json({
      sucesso: true,
      totalJogadores: Number(jogadores.rows[0].total),
      totalPontos: Number(pontos.rows[0].total),
      saldoTotal: Number(saldo.rows[0].total)
    });

  } catch (erro) {
    console.error("Erro no dashboard:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar dashboard."
    });
  }
});

// ===============================
// JOGADORES
// ===============================

app.get("/api/admin/jogadores", async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        id,
        email,
        nome AS nome_completo,
        cpf,
        pontos,
        saldo AS equilibrio,
        criado_em
      FROM jogadores
      ORDER BY id DESC
    `);

    res.json({
      sucesso: true,
      jogadores: resultado.rows
    });

  } catch (erro) {
    console.error("Erro ao buscar jogadores:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar jogadores."
    });
  }
});

// Rota alternativa
app.get("/api/jogadores", async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        id,
        email,
        nome AS nome_completo,
        cpf,
        pontos,
        saldo AS equilibrio,
        criado_em
      FROM jogadores
      ORDER BY id DESC
    `);

    res.json({
      sucesso: true,
      jogadores: resultado.rows
    });

  } catch (erro) {
    console.error("Erro ao buscar jogadores:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar jogadores."
    });
  }
});

// ===============================
// LISTAR PERGUNTAS
// ===============================

app.get("/api/admin/perguntas", async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        id,
        pergunta,
        resposta_a AS alternativa_a,
        resposta_b AS alternativa_b,
        resposta_c AS alternativa_c,
        resposta_d AS alternativa_d,
        resposta_correta,
        dificuldade,
        criado_em
      FROM perguntas
      ORDER BY id DESC
    `);

    res.json({
      sucesso: true,
      perguntas: resultado.rows
    });

  } catch (erro) {
    console.error("Erro ao buscar perguntas:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar perguntas."
    });
  }
});

// Rota alternativa
app.get("/api/perguntas", async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        id,
        pergunta,
        resposta_a AS alternativa_a,
        resposta_b AS alternativa_b,
        resposta_c AS alternativa_c,
        resposta_d AS alternativa_d,
        resposta_correta,
        dificuldade,
        criado_em
      FROM perguntas
      ORDER BY id DESC
    `);

    res.json({
      sucesso: true,
      perguntas: resultado.rows
    });

  } catch (erro) {
    console.error("Erro ao buscar perguntas:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar perguntas."
    });
  }
});

// ===============================
// CADASTRAR UMA PERGUNTA
// ===============================

app.post("/api/admin/perguntas", async (req, res) => {
  try {
    const {
      pergunta,
      alternativa_a,
      alternativa_b,
      alternativa_c,
      alternativa_d,
      resposta_correta,
      dificuldade
    } = req.body;

    if (
      !pergunta ||
      !alternativa_a ||
      !alternativa_b ||
      !alternativa_c ||
      !alternativa_d ||
      !resposta_correta
    ) {
      return res.status(400).json({
        sucesso: false,
        erro: "Preencha todos os campos da pergunta."
      });
    }

    const dificuldadeFinal = dificuldade || "facil";

    const resultado = await pool.query(`
      INSERT INTO perguntas
      (
        pergunta,
        resposta_a,
        resposta_b,
        resposta_c,
        resposta_d,
        resposta_correta,
        dificuldade
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      pergunta,
      alternativa_a,
      alternativa_b,
      alternativa_c,
      alternativa_d,
      resposta_correta,
      dificuldadeFinal
    ]);

    res.json({
      sucesso: true,
      mensagem: "Pergunta cadastrada com sucesso.",
      pergunta: resultado.rows[0]
    });

  } catch (erro) {
    console.error("Erro ao cadastrar pergunta:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao cadastrar pergunta."
    });
  }
});

// ===============================
// IMPORTAÇÃO EM MASSA
// ===============================

app.post("/api/admin/perguntas/importar", async (req, res) => {
  const perguntas = req.body.perguntas;

  if (!Array.isArray(perguntas) || perguntas.length === 0) {
    return res.status(400).json({
      sucesso: false,
      erro: "Envie uma lista de perguntas."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let quantidade = 0;

    for (const item of perguntas) {
      if (
        !item.pergunta ||
        !item.alternativa_a ||
        !item.alternativa_b ||
        !item.alternativa_c ||
        !item.alternativa_d ||
        !item.resposta_correta
      ) {
        continue;
      }

      const dificuldade = item.dificuldade || "facil";

      await client.query(`
        INSERT INTO perguntas
        (
          pergunta,
          resposta_a,
          resposta_b,
          resposta_c,
          resposta_d,
          resposta_correta,
          dificuldade
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        item.pergunta,
        item.alternativa_a,
        item.alternativa_b,
        item.alternativa_c,
        item.alternativa_d,
        item.resposta_correta,
        dificuldade
      ]);

      quantidade++;
    }

    await client.query("COMMIT");

    res.json({
      sucesso: true,
      mensagem: "Perguntas importadas com sucesso.",
      quantidade
    });

  } catch (erro) {
    await client.query("ROLLBACK");

    console.error("Erro na importação:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao importar perguntas."
    });

  } finally {
    client.release();
  }
});

// ===============================
// INICIAR SERVIDOR
// ===============================

prepararBanco().finally(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`QuizUp Admin Backend rodando na porta ${PORT}`);
  });
});
