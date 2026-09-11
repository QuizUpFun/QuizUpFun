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

    await pool.query(`
      ALTER TABLE perguntas
      ADD COLUMN IF NOT EXISTS dificuldade VARCHAR(10) DEFAULT 'facil'
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_perguntas_id
      ON perguntas (id)
    `);

    console.log("Tabela perguntas verificada.");

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

// ======================================================
// BUSCAR JOGADOR
// ======================================================

app.get("/api/jogador/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        sucesso: false,
        erro: "ID inválido."
      });
    }

    const resultado = await pool.query(
      `
      SELECT
        id,
        email,
        nome,
        cpf,
        codigo_indicacao,
        pontos,
        equilibrio,
        criado_em
      FROM jogadores
      WHERE id = $1
      `,
      [id]
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
    console.error("Erro jogador:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao buscar jogador."
    });
  }
});

// ======================================================
// ATUALIZAR JOGADOR
// ======================================================

app.put("/api/jogador/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { pontos, equilibrio } = req.body;

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        sucesso: false,
        erro: "ID inválido."
      });
    }

    const novosPontos = Number(pontos);
    const novoEquilibrio = Number(equilibrio || 0);

    if (!Number.isFinite(novosPontos) || novosPontos < 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "Pontuação inválida."
      });
    }

    if (!Number.isFinite(novoEquilibrio) || novoEquilibrio < 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "Equilíbrio inválido."
      });
    }

    const resultado = await pool.query(
      `
      UPDATE jogadores
      SET
        pontos = $1,
        equilibrio = $2
      WHERE id = $3
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
        Math.floor(novosPontos),
        novoEquilibrio,
        id
      ]
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
    console.error("Erro atualizar jogador:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao atualizar jogador."
    });
  }
});

// ======================================================
// RECUPERAR SENHA
// ======================================================

app.post("/api/recuperar-senha", async (req, res) => {
  try {
    const {
      email,
      cpf,
      novaSenha
    } = req.body;

    if (!email || !cpf || !novaSenha) {
      return res.status(400).json({
        sucesso: false,
        erro: "Preencha todos os campos."
      });
    }

    if (novaSenha.length < 6) {
      return res.status(400).json({
        sucesso: false,
        erro: "A nova senha deve ter pelo menos 6 caracteres."
      });
    }

    const emailNormalizado = String(email).trim().toLowerCase();
    const cpfLimpo = limparCPF(cpf);

    const resultado = await pool.query(
      `
      SELECT id
      FROM jogadores
      WHERE LOWER(email) = $1
        AND cpf = $2
      LIMIT 1
      `,
      [
        emailNormalizado,
        cpfLimpo
      ]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: "E-mail e CPF não conferem."
      });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);

    await pool.query(
      `
      UPDATE jogadores
      SET senha = $1
      WHERE id = $2
      `,
      [
        senhaHash,
        resultado.rows[0].id
      ]
    );

    res.json({
      sucesso: true,
      mensagem: "Senha alterada com sucesso."
    });

  } catch (erro) {
    console.error("Erro recuperar senha:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao recuperar senha."
    });
  }
});

// ======================================================
// ADMIN SETUP
// ======================================================

app.post("/api/admin/setup", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        sucesso: false,
        erro: "Informe e-mail e senha."
      });
    }

    const emailNormalizado = String(email).trim().toLowerCase();

    const existente = await pool.query(
      `
      SELECT id
      FROM admins
      WHERE LOWER(email) = $1
      LIMIT 1
      `,
      [emailNormalizado]
    );

    if (existente.rows.length > 0) {
      return res.status(409).json({
        sucesso: false,
        erro: "Administrador já cadastrado."
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const resultado = await pool.query(
      `
      INSERT INTO admins
      (email, senha)
      VALUES ($1, $2)
      RETURNING id, email, criado_em
      `,
      [
        emailNormalizado,
        senhaHash
      ]
    );

    res.json({
      sucesso: true,
      admin: resultado.rows[0]
    });

  } catch (erro) {
    console.error("Erro admin setup:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao criar administrador."
    });
  }
});

// ======================================================
// LOGIN ADMIN
// ======================================================

app.post("/api/admin/login", async (req, res) => {
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
      FROM admins
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
    console.error("Erro admin login:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao realizar login."
    });
  }
});

// ======================================================
// DASHBOARD ADMIN
// ======================================================

app.get("/api/admin/dashboard", async (req, res) => {
  try {
    const jogadores = await pool.query(`
      SELECT COUNT(*)::integer AS total
      FROM jogadores
    `);

    const pontos = await pool.query(`
      SELECT COALESCE(SUM(pontos), 0)::bigint AS total
      FROM jogadores
    `);

    let saquesPendentes = 0;

    try {
      const saques = await pool.query(`
        SELECT COUNT(*)::integer AS total
        FROM saques
        WHERE LOWER(status) IN ('pendente', 'pending')
      `);

      saquesPendentes = saques.rows[0].total;

    } catch (erroSaques) {
      console.log("Tabela saques ainda não disponível.");
    }

    res.json({
      sucesso: true,
      jogadores: jogadores.rows[0].total,
      pontos: pontos.rows[0].total,
      saques_pendentes: saquesPendentes
    });

  } catch (erro) {
    console.error("Erro dashboard:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar dashboard."
    });
  }
});

// ======================================================
// LISTAR JOGADORES
// ======================================================

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
        equilibrio,
        criado_em
      FROM jogadores
      ORDER BY id DESC
    `);

    res.json({
      sucesso: true,
      jogadores: resultado.rows
    });

  } catch (erro) {
    console.error("Erro ao carregar jogadores:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao carregar jogadores."
    });
  }
});

// ======================================================
// PERGUNTAS ADMIN
// ======================================================

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
        criada_em
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
        erro: "Preencha todos os campos."
      });
    }

    const resposta = String(resposta_correta)
      .toUpperCase()
      .trim();

    if (!["A", "B", "C", "D"].includes(resposta)) {
      return res.status(400).json({
        sucesso: false,
        erro: "Resposta correta inválida."
      });
    }

    const nivel = String(dificuldade || "facil")
      .toLowerCase()
      .trim();

    if (!["facil", "medio", "dificil"].includes(nivel)) {
      return res.status(400).json({
        sucesso: false,
        erro: "Dificuldade inválida."
      });
    }

    const resultado = await pool.query(
      `
      INSERT INTO perguntas
      (
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
        pergunta.trim(),
        alternativa_a.trim(),
        alternativa_b.trim(),
        alternativa_c.trim(),
        alternativa_d.trim(),
        resposta,
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

// ======================================================
// IMPORTAÇÃO DE PERGUNTAS EM LOTE
// ======================================================

app.post("/api/admin/perguntas/importar", async (req, res) => {
  try {
    const { perguntas } = req.body;

    if (!Array.isArray(perguntas) || perguntas.length === 0) {
      return res.status(400).json({
        sucesso: false,
        erro: "Nenhuma pergunta enviada."
      });
    }

    if (perguntas.length > 1000) {
      return res.status(400).json({
        sucesso: false,
        erro: "O máximo por lote é 1000 perguntas."
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      let inseridas = 0;

      for (const p of perguntas) {
        const pergunta = String(p.pergunta || "").trim();
        const alternativaA = String(p.alternativa_a || "").trim();
        const alternativaB = String(p.alternativa_b || "").trim();
        const alternativaC = String(p.alternativa_c || "").trim();
        const alternativaD = String(p.alternativa_d || "").trim();

        const resposta = String(p.resposta_correta || "")
          .toUpperCase()
          .trim();

        const dificuldade = String(p.dificuldade || "facil")
          .toLowerCase()
          .trim();

        if (
          !pergunta ||
          !alternativaA ||
          !alternativaB ||
          !alternativaC ||
          !alternativaD
        ) {
          continue;
        }

        if (!["A", "B", "C", "D"].includes(resposta)) {
          continue;
        }

        if (!["facil", "medio", "dificil"].includes(dificuldade)) {
          continue;
        }

        await client.query(
          `
          INSERT INTO perguntas
          (
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
            pergunta,
            alternativaA,
            alternativaB,
            alternativaC,
            alternativaD,
            resposta,
            dificuldade
          ]
        );

        inseridas++;
      }

      await client.query("COMMIT");

      res.json({
        sucesso: true,
        inseridas
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

// ======================================================
// SAQUE
// ======================================================

app.post("/api/saques", async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      jogador_id,
      pix_key,
      quantia,
      metodo
    } = req.body;

    const jogadorId = Number(jogador_id);
    const valor = Number(quantia);

    if (!Number.isInteger(jogadorId)) {
      return res.status(400).json({
        sucesso: false,
        erro: "Jogador inválido."
      });
    }

    if (![1, 5, 10].includes(valor)) {
      return res.status(400).json({
        sucesso: false,
        erro: "Valor de saque inválido."
      });
    }

    if (!pix_key) {
      return res.status(400).json({
        sucesso: false,
        erro: "Informe a chave Pix."
      });
    }

    const pontosNecessarios = {
      1: 2000,
      5: 6000,
      10: 11000
    };

    const pontosParaSaque = pontosNecessarios[valor];

    await client.query("BEGIN");

    const jogadorResult = await client.query(
      `
      SELECT
        id,
        email,
        pontos,
        equilibrio
      FROM jogadores
      WHERE id = $1
      FOR UPDATE
      `,
      [jogadorId]
    );

    if (jogadorResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        sucesso: false,
        erro: "Jogador não encontrado."
      });
    }

    const jogador = jogadorResult.rows[0];

    if (Number(jogador.pontos) < pontosParaSaque) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        sucesso: false,
        erro: `Você precisa de ${pontosParaSaque} pontos para sacar R$ ${valor}.`
      });
    }

    const quantidadeHoje = await client.query(
      `
      SELECT COUNT(*)::integer AS total
      FROM saques
      WHERE jogador_id = $1
        AND criado_em >= CURRENT_DATE
        AND criado_em < CURRENT_DATE + INTERVAL '1 day'
      `,
      [jogadorId]
    );

    if (Number(quantidadeHoje.rows[0].total) >= 2) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        sucesso: false,
        erro: "Limite de 2 saques por dia atingido."
      });
    }

    const valorJogador = Number((valor * 0.70).toFixed(2));
    const valorPlataforma = Number((valor * 0.30).toFixed(2));

    const saque = await client.query(
      `
      INSERT INTO saques
      (
        jogador_id,
        pix_key,
        status,
        quantia,
        valor_jogador,
        valor_plataforma,
        metodo,
        email,
        criado_em
      )
      VALUES
      ($1, $2, 'pendente', $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING *
      `,
      [
        jogadorId,
        pix_key,
        valor,
        valorJogador,
        valorPlataforma,
        metodo || "pix",
        jogador.email
      ]
    );

    await client.query(
      `
      UPDATE jogadores
      SET pontos = pontos - $1
      WHERE id = $2
      `,
      [
        pontosParaSaque,
        jogadorId
      ]
    );

    await client.query("COMMIT");

    res.json({
      sucesso: true,
      saque: saque.rows[0],
      pontos_descontados: pontosParaSaque,
      valor_jogador: valorJogador,
      valor_plataforma: valorPlataforma
    });

  } catch (erro) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    console.error("Erro saque:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao solicitar saque."
    });

  } finally {
    client.release();
  }
});

// ======================================================
// INICIAR
// ======================================================

async function iniciar() {
  await prepararBanco();

  app.listen(PORT, () => {
    console.log(`QuizUp Admin Backend rodando na porta ${PORT}`);
  });
}

iniciar();
