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

/* =========================================================
   ROTA PRINCIPAL
========================================================= */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "QuizUp Admin Backend funcionando!"
  });
});

/* =========================================================
   TESTE DO BANCO
========================================================= */

app.get("/api/test-db", async (req, res) => {
  try {
    const resultado = await pool.query("SELECT NOW() AS agora");

    res.json({
      status: "ok",
      banco: "PostgreSQL Aiven",
      hora: resultado.rows[0].agora
    });
  } catch (erro) {
    console.error("Erro no banco:", erro);

    res.status(500).json({
      status: "erro",
      erro: erro.message
    });
  }
});

/* =========================================================
   PREPARAR BANCO
========================================================= */

async function prepararBanco() {
  try {
    /* =========================
       TABELA ADMINS
    ========================= */

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    /* =========================
       TABELA JOGADORES
    ========================= */

    await pool.query(`
      CREATE TABLE IF NOT EXISTS jogadores (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        nome TEXT,
        cpf TEXT,
        codigo_indicacao TEXT,
        pontos INTEGER DEFAULT 0,
        saldo NUMERIC(10,2) DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    /* =========================
       TABELA PERGUNTAS
    ========================= */

    await pool.query(`
      CREATE TABLE IF NOT EXISTS perguntas (
        id SERIAL PRIMARY KEY,
        pergunta TEXT NOT NULL,
        resposta_a TEXT NOT NULL,
        resposta_b TEXT NOT NULL,
        resposta_c TEXT NOT NULL,
        resposta_d TEXT NOT NULL,
        resposta_correta TEXT NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    /* =========================
       ADICIONAR DIFICULDADE
       SE A COLUNA AINDA NÃO EXISTIR
    ========================= */

    await pool.query(`
      ALTER TABLE perguntas
      ADD COLUMN IF NOT EXISTS dificuldade TEXT DEFAULT 'facil'
    `);

    /* =========================
       ADICIONAR SALDO
       SE A COLUNA AINDA NÃO EXISTIR
    ========================= */

    await pool.query(`
      ALTER TABLE jogadores
      ADD COLUMN IF NOT EXISTS saldo NUMERIC(10,2) DEFAULT 0
    `);

    /* =========================
       ÍNDICES
    ========================= */

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_perguntas_dificuldade
      ON perguntas (dificuldade)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_perguntas_id
      ON perguntas (id)
    `);

    console.log("Tabela admins pronta.");
    console.log("Tabela jogadores verificada.");
    console.log("Tabela perguntas verificada.");
  } catch (erro) {
    console.error("Erro ao preparar banco:", erro);
  }
}

/* =========================================================
   LOGIN DO ADMIN
========================================================= */

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
      `
      SELECT id, email, senha
      FROM admins
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [email.trim()]
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
      admin: {
        id: admin.id,
        email: admin.email
      }
    });
  } catch (erro) {
    console.error("Erro no login:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro interno no login."
    });
  }
});

/* =========================================================
   DASHBOARD
========================================================= */

app.get("/api/admin/dashboard", async (req, res) => {
  try {
    const jogadores = await pool.query(
      `SELECT COUNT(*)::integer AS total FROM jogadores`
    );

    const perguntas = await pool.query(
      `SELECT COUNT(*)::integer AS total FROM perguntas`
    );

    res.json({
      sucesso: true,
      jogadores: jogadores.rows[0].total,
      perguntas: perguntas.rows[0].total,
      parceiros: 0,
      saques: 0,
      pendentes: 0,
      aprovados: 0,
      cancelados: 0
    });
  } catch (erro) {
    console.error("Erro no dashboard:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar dashboard."
    });
  }
});

/* =========================================================
   LISTAR JOGADORES
========================================================= */

app.get("/api/admin/jogadores", async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        id,
        email,
        nome,
        cpf,
        codigo_indicacao,
        pontos,
        saldo,
        criado_em
      FROM jogadores
      ORDER BY id DESC
    `);

    res.json({
      sucesso: true,
      jogadores: resultado.rows
    });
  } catch (erro) {
    console.error("Erro ao listar jogadores:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar jogadores."
    });
  }
});

/* =========================================================
   JOGADORES
========================================================= */

app.post("/api/jogadores", async (req, res) => {
  try {
    const {
      email,
      nome,
      cpf,
      codigo_indicacao
    } = req.body;

    if (!email) {
      return res.status(400).json({
        sucesso: false,
        erro: "E-mail é obrigatório."
      });
    }

    const existente = await pool.query(
      `
      SELECT id
      FROM jogadores
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [email.trim()]
    );

    if (existente.rows.length > 0) {
      return res.status(409).json({
        sucesso: false,
        erro: "Este jogador já está cadastrado."
      });
    }

    const resultado = await pool.query(
      `
      INSERT INTO jogadores
      (
        email,
        nome,
        cpf,
        codigo_indicacao,
        pontos,
        saldo
      )
      VALUES ($1, $2, $3, $4, 0, 0)
      RETURNING *
      `,
      [
        email.trim().toLowerCase(),
        nome || null,
        cpf || null,
        codigo_indicacao || null
      ]
    );

    res.json({
      sucesso: true,
      jogador: resultado.rows[0]
    });
  } catch (erro) {
    console.error("Erro ao cadastrar jogador:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao cadastrar jogador."
    });
  }
});

/* =========================================================
   LISTAR PERGUNTAS - ADMIN
========================================================= */

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
    console.error("Erro ao listar perguntas:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar perguntas."
    });
  }
});

/* =========================================================
   NOVO ENDPOINT DO JOGO
   BUSCA UMA PERGUNTA DE ACORDO COM A DIFICULDADE
========================================================= */

app.get("/api/pergunta-aleatoria", async (req, res) => {
  try {
    const dificuldadeRecebida = String(
      req.query.dificuldade || ""
    )
      .trim()
      .toLowerCase();

    const dificuldadesValidas = [
      "facil",
      "médio",
      "medio",
      "difícil",
      "dificil"
    ];

    if (!dificuldadesValidas.includes(dificuldadeRecebida)) {
      return res.status(400).json({
        sucesso: false,
        erro: "Dificuldade inválida. Use facil, medio ou dificil."
      });
    }

    let dificuldade = dificuldadeRecebida;

    /* Padroniza os acentos */

    if (dificuldade === "médio") {
      dificuldade = "medio";
    }

    if (dificuldade === "difícil") {
      dificuldade = "dificil";
    }

    const resultado = await pool.query(
      `
      SELECT
        id,
        pergunta,
        resposta_a AS alternativa_a,
        resposta_b AS alternativa_b,
        resposta_c AS alternativa_c,
        resposta_d AS alternativa_d,
        resposta_correta,
        dificuldade
      FROM perguntas
      WHERE LOWER(
        REPLACE(
          REPLACE(
            REPLACE(dificuldade, 'á', 'a'),
            'é', 'e'
          ),
          'í', 'i'
        )
      ) = $1
      ORDER BY RANDOM()
      LIMIT 1
      `,
      [dificuldade]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: `Nenhuma pergunta ${dificuldade} cadastrada.`
      });
    }

    res.json({
      sucesso: true,
      pergunta: resultado.rows[0]
    });
  } catch (erro) {
    console.error(
      "Erro ao buscar pergunta por dificuldade:",
      erro
    );

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao buscar pergunta."
    });
  }
});

/* =========================================================
   ROTA ANTIGA DE PERGUNTAS
========================================================= */

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
        dificuldade
      FROM perguntas
      ORDER BY id DESC
    `);

    res.json({
      sucesso: true,
      perguntas: resultado.rows
    });
  } catch (erro) {
    console.error("Erro ao carregar perguntas:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar perguntas."
    });
  }
});

/* =========================================================
   CRIAR PERGUNTA MANUALMENTE PELO ADMIN
========================================================= */

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

    let nivel = String(
      dificuldade || "facil"
    )
      .trim()
      .toLowerCase();

    if (nivel === "fácil") {
      nivel = "facil";
    }

    if (nivel === "médio") {
      nivel = "medio";
    }

    if (nivel === "difícil") {
      nivel = "dificil";
    }

    if (!["facil", "medio", "dificil"].includes(nivel)) {
      return res.status(400).json({
        sucesso: false,
        erro: "Dificuldade inválida."
      });
    }

    const correta = String(
      resposta_correta
    )
      .trim()
      .toUpperCase();

    if (!["A", "B", "C", "D"].includes(correta)) {
      return res.status(400).json({
        sucesso: false,
        erro: "A resposta correta deve ser A, B, C ou D."
      });
    }

    const resultado = await pool.query(
      `
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
      `,
      [
        pergunta.trim(),
        alternativa_a.trim(),
        alternativa_b.trim(),
        alternativa_c.trim(),
        alternativa_d.trim(),
        correta,
        nivel
      ]
    );

    res.json({
      sucesso: true,
      pergunta: resultado.rows[0]
    });
  } catch (erro) {
    console.error("Erro ao criar pergunta:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao criar pergunta."
    });
  }
});

/* =========================================================
   IMPORTAÇÃO DE PERGUNTAS
========================================================= */

app.post("/api/admin/perguntas/importar", async (req, res) => {
  try {
    const perguntas = req.body.perguntas;

    if (!Array.isArray(perguntas)) {
      return res.status(400).json({
        sucesso: false,
        erro: "O campo perguntas deve ser uma lista."
      });
    }

    let inseridas = 0;

    for (const p of perguntas) {
      if (
        !p.pergunta ||
        !p.alternativa_a ||
        !p.alternativa_b ||
        !p.alternativa_c ||
        !p.alternativa_d ||
        !p.resposta_correta
      ) {
        continue;
      }

      let nivel = String(
        p.dificuldade || "facil"
      )
        .trim()
        .toLowerCase();

      if (nivel === "fácil") {
        nivel = "facil";
      }

      if (nivel === "médio") {
        nivel = "medio";
      }

      if (nivel === "difícil") {
        nivel = "dificil";
      }

      if (!["facil", "medio", "dificil"].includes(nivel)) {
        continue;
      }

      const correta = String(
        p.resposta_correta
      )
        .trim()
        .toUpperCase();

      if (!["A", "B", "C", "D"].includes(correta)) {
        continue;
      }

      await pool.query(
        `
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
        `,
        [
          p.pergunta.trim(),
          p.alternativa_a.trim(),
          p.alternativa_b.trim(),
          p.alternativa_c.trim(),
          p.alternativa_d.trim(),
          correta,
          nivel
        ]
      );

      inseridas++;
    }

    res.json({
      sucesso: true,
      inseridas
    });
  } catch (erro) {
    console.error("Erro na importação:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao importar perguntas."
    });
  }
});

/* =========================================================
   INICIAR SERVIDOR
========================================================= */

prepararBanco().finally(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `QuizUp Admin Backend rodando na porta ${PORT}`
    );
  });
});
