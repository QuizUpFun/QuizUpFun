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
    const resultado = await pool.query("SELECT NOW() AS agora");

    res.json({
      status: "ok",
      banco: "PostgreSQL",
      hora: resultado.rows[0].agora
    });
  } catch (erro) {
    console.error("Erro no banco:", erro);

    res.status(500).json({
      status: "erro",
      erro: "Não foi possível conectar ao banco."
    });
  }
});


// =====================================================
// PREPARAR BANCO
// =====================================================

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
        email VARCHAR(255) UNIQUE NOT NULL,
        senha VARCHAR(255),
        nome_completo TEXT,
        cpf VARCHAR(20) UNIQUE,
        codigo_indicacao VARCHAR(100),
        pontos INTEGER DEFAULT 0,
        saldo NUMERIC(12,2) DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tabela jogadores verificada.");


    await pool.query(`
      ALTER TABLE jogadores
      ADD COLUMN IF NOT EXISTS saldo NUMERIC(12,2) DEFAULT 0
    `);


    await pool.query(`
      CREATE TABLE IF NOT EXISTS perguntas (
        id SERIAL PRIMARY KEY,
        pergunta TEXT NOT NULL,
        alternativa_a TEXT NOT NULL,
        alternativa_b TEXT NOT NULL,
        alternativa_c TEXT NOT NULL,
        alternativa_d TEXT NOT NULL,
        resposta_correta VARCHAR(10) NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        dificuldade VARCHAR(20)
      )
    `);

    await pool.query(`
      ALTER TABLE perguntas
      ADD COLUMN IF NOT EXISTS dificuldade VARCHAR(20)
    `);

    console.log("Tabela perguntas verificada.");


    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_perguntas_dificuldade
      ON perguntas(dificuldade)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_jogadores_email
      ON jogadores(email)
    `);

    console.log("Banco preparado.");

  } catch (erro) {
    console.error("Erro ao preparar banco:", erro);
  }
}


// =====================================================
// LOGIN ADMINISTRATIVO
// =====================================================

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
      SELECT *
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
      mensagem: "Login realizado com sucesso.",
      admin: {
        id: admin.id,
        email: admin.email
      }
    });

  } catch (erro) {
    console.error("Erro no login administrativo:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro interno no servidor."
    });
  }
});


// =====================================================
// DASHBOARD
// =====================================================

app.get("/api/admin/dashboard", async (req, res) => {
  try {

    const jogadores = await pool.query(`
      SELECT COUNT(*) AS total
      FROM jogadores
    `);

    const perguntas = await pool.query(`
      SELECT COUNT(*) AS total
      FROM perguntas
    `);

    res.json({
      sucesso: true,
      jogadores: Number(jogadores.rows[0].total),
      perguntas: Number(perguntas.rows[0].total)
    });

  } catch (erro) {
    console.error("Erro no dashboard:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar dashboard."
    });
  }
});


// =====================================================
// LISTAR JOGADORES NO ADMIN
// =====================================================

app.get("/api/admin/jogadores", async (req, res) => {
  try {

    const resultado = await pool.query(`
      SELECT
        id,
        email,
        nome_completo,
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


// =====================================================
// DADOS DO JOGADOR
// =====================================================

app.get("/api/jogador/:id", async (req, res) => {
  try {

    const resultado = await pool.query(
      `
      SELECT
        id,
        email,
        nome_completo,
        cpf,
        codigo_indicacao,
        pontos,
        saldo,
        criado_em
      FROM jogadores
      WHERE id = $1
      LIMIT 1
      `,
      [req.params.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: "Jogador não encontrado."
      });
    }

    res.json({
      sucesso: true,
      jogador: resultado.rows[0]
    });

  } catch (erro) {
    console.error("Erro ao buscar jogador:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao buscar jogador."
    });
  }
});


// =====================================================
// CADASTRO DE JOGADOR
// =====================================================

app.post("/api/cadastro", async (req, res) => {
  try {

    const {
      email,
      senha,
      nome,
      nome_completo,
      cpf,
      codigo_indicacao,
      codigo
    } = req.body;

    const nomeFinal = nome_completo || nome || "";
    const codigoFinal = codigo_indicacao || codigo || "";

    if (!email || !senha || !nomeFinal || !cpf) {
      return res.status(400).json({
        sucesso: false,
        erro: "Preencha todos os campos obrigatórios."
      });
    }

    const emailLimpo = email.trim().toLowerCase();
    const cpfLimpo = cpf.trim();

    const existente = await pool.query(
      `
      SELECT id
      FROM jogadores
      WHERE LOWER(email) = LOWER($1)
         OR cpf = $2
      LIMIT 1
      `,
      [emailLimpo, cpfLimpo]
    );

    if (existente.rows.length > 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "E-mail ou CPF já cadastrado."
      });
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    const resultado = await pool.query(
      `
      INSERT INTO jogadores (
        email,
        senha,
        nome_completo,
        cpf,
        codigo_indicacao,
        pontos,
        saldo
      )
      VALUES ($1, $2, $3, $4, $5, 0, 0)
      RETURNING
        id,
        email,
        nome_completo,
        cpf,
        codigo_indicacao,
        pontos,
        saldo,
        criado_em
      `,
      [
        emailLimpo,
        senhaHash,
        nomeFinal,
        cpfLimpo,
        codigoFinal
      ]
    );

    res.json({
      sucesso: true,
      mensagem: "Cadastro realizado com sucesso.",
      jogador: resultado.rows[0]
    });

  } catch (erro) {
    console.error("Erro no cadastro:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao realizar cadastro."
    });
  }
});


// =====================================================
// LOGIN DO JOGADOR
// =====================================================

app.post("/api/login", async (req, res) => {
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
      SELECT *
      FROM jogadores
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

    res.json({
      sucesso: true,
      jogador: {
        id: jogador.id,
        email: jogador.email,
        nome: jogador.nome_completo,
        nome_completo: jogador.nome_completo,
        cpf: jogador.cpf,
        codigo_indicacao: jogador.codigo_indicacao,
        pontos: jogador.pontos || 0,
        saldo: Number(jogador.saldo || 0)
      }
    });

  } catch (erro) {
    console.error("Erro no login do jogador:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao realizar login."
    });
  }
});


// =====================================================
// RECUPERAÇÃO DE SENHA
// =====================================================

app.post("/api/recuperar-senha", async (req, res) => {
  try {

    const { email, cpf } = req.body;

    if (!email || !cpf) {
      return res.status(400).json({
        sucesso: false,
        erro: "Informe o e-mail e o CPF."
      });
    }

    const resultado = await pool.query(
      `
      SELECT id
      FROM jogadores
      WHERE LOWER(email) = LOWER($1)
        AND cpf = $2
      LIMIT 1
      `,
      [
        email.trim(),
        cpf.trim()
      ]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: "E-mail e CPF não conferem."
      });
    }

    res.json({
      sucesso: true,
      mensagem: "Dados encontrados. A recuperação de senha poderá ser realizada."
    });

  } catch (erro) {
    console.error("Erro na recuperação:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro na recuperação de senha."
    });
  }
});


// =====================================================
// LISTAR PERGUNTAS NO ADMIN
// =====================================================

app.get("/api/admin/perguntas", async (req, res) => {
  try {

    const resultado = await pool.query(`
      SELECT
        id,
        pergunta,
        alternativa_a,
        alternativa_b,
        alternativa_c,
        alternativa_d,
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


// =====================================================
// LISTAR PERGUNTAS
// =====================================================

app.get("/api/perguntas", async (req, res) => {
  try {

    const resultado = await pool.query(`
      SELECT
        id,
        pergunta,
        alternativa_a,
        alternativa_b,
        alternativa_c,
        alternativa_d,
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


// =====================================================
// CRIAR PERGUNTA PELO ADMIN
// =====================================================

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
      !resposta_correta ||
      !dificuldade
    ) {
      return res.status(400).json({
        sucesso: false,
        erro: "Preencha todos os campos da pergunta."
      });
    }

    const resultado = await pool.query(
      `
      INSERT INTO perguntas (
        pergunta,
        alternativa_a,
        alternativa_b,
        alternativa_c,
        alternativa_d,
        resposta_correta,
        dificuldade
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        pergunta,
        alternativa_a,
        alternativa_b,
        alternativa_c,
        alternativa_d,
        String(resposta_correta).toUpperCase().trim(),
        dificuldade
      ]
    );

    res.json({
      sucesso: true,
      mensagem: "Pergunta criada com sucesso.",
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


// =====================================================
// IMPORTAR PERGUNTAS EM LOTE
// =====================================================

app.post("/api/admin/perguntas/importar", async (req, res) => {
  try {

    const perguntas = req.body.perguntas;

    if (!Array.isArray(perguntas) || perguntas.length === 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "Nenhuma pergunta foi enviada."
      });
    }

    const client = await pool.connect();

    try {

      await client.query("BEGIN");

      for (const p of perguntas) {

        if (
          !p.pergunta ||
          !p.alternativa_a ||
          !p.alternativa_b ||
          !p.alternativa_c ||
          !p.alternativa_d ||
          !p.resposta_correta ||
          !p.dificuldade
        ) {
          continue;
        }

        await client.query(
          `
          INSERT INTO perguntas (
            pergunta,
            alternativa_a,
            alternativa_b,
            alternativa_c,
            alternativa_d,
            resposta_correta,
            dificuldade
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            p.pergunta,
            p.alternativa_a,
            p.alternativa_b,
            p.alternativa_c,
            p.alternativa_d,
            String(p.resposta_correta)
              .toUpperCase()
              .trim(),
            p.dificuldade
          ]
        );
      }

      await client.query("COMMIT");

      res.json({
        sucesso: true,
        mensagem: "Perguntas importadas com sucesso.",
        quantidade: perguntas.length
      });

    } catch (erro) {

      await client.query("ROLLBACK");
      throw erro;

    } finally {
      client.release();
    }

  } catch (erro) {
    console.error("Erro ao importar perguntas:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao importar perguntas."
    });
  }
});


// =====================================================
// PERGUNTA ALEATÓRIA POR DIFICULDADE
// =====================================================

app.get("/api/pergunta-aleatoria", async (req, res) => {
  try {

    const dificuldadeRecebida = String(
      req.query.dificuldade || ""
    )
      .trim()
      .toLowerCase();

    const dificuldadesValidas = [
      "facil",
      "fácil",
      "medio",
      "médio",
      "dificil",
      "difícil"
    ];

    if (!dificuldadesValidas.includes(dificuldadeRecebida)) {
      return res.status(400).json({
        sucesso: false,
        erro: "Dificuldade inválida. Use facil, medio ou dificil."
      });
    }

    let dificuldade = dificuldadeRecebida;

    if (
      dificuldade === "fácil"
    ) {
      dificuldade = "facil";
    }

    if (
      dificuldade === "médio"
    ) {
      dificuldade = "medio";
    }

    if (
      dificuldade === "difícil"
    ) {
      dificuldade = "dificil";
    }

    const resultado = await pool.query(
      `
      SELECT
        id,
        pergunta,
        alternativa_a,
        alternativa_b,
        alternativa_c,
        alternativa_d,
        resposta_correta,
        dificuldade
      FROM perguntas
      WHERE LOWER(
        REPLACE(
          REPLACE(
            REPLACE(
              dificuldade,
              'á',
              'a'
            ),
            'é',
            'e'
          ),
          'í',
          'i'
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


// =====================================================
// SAQUES
// =====================================================

app.post("/api/saques", async (req, res) => {
  try {

    const {
      jogador_id,
      pix_key,
      valor,
      pontos,
      metodo,
      email
    } = req.body;

    if (!jogador_id || !pix_key || !valor) {
      return res.status(400).json({
        sucesso: false,
        erro: "Dados do saque incompletos."
      });
    }

    res.json({
      sucesso: true,
      mensagem: "Solicitação de saque recebida.",
      saque: {
        jogador_id,
        pix_key,
        valor,
        pontos,
        metodo,
        email
      }
    });

  } catch (erro) {

    console.error("Erro no saque:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao solicitar saque."
    });
  }
});


// =====================================================
// INICIAR SERVIDOR
// =====================================================

async function iniciarServidor() {

  await prepararBanco();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `QuizUp Admin Backend rodando na porta ${PORT}`
    );
  });
}

iniciarServidor();
