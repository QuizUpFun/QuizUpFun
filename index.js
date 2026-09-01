import {
  Client,
  TablesDB,
  Query
} from "node-appwrite";

/*
=========================================================
 QUIZUP ADMIN — APPWRITE FUNCTION
 Node 26
 node-appwrite 17
 ES MODULE
=========================================================

 IMPORTANTE:
 - Este arquivo usa import, NÃO require.
 - O package.json deve conter:
   "type": "module"
 - A função deve ter acesso aos escopos necessários
   para ler e escrever as tabelas.
=========================================================
*/


/* ======================================================
   CONFIGURAÇÃO
====================================================== */

const PROJECT_ID =
  process.env.APPWRITE_FUNCTION_PROJECT_ID ||
  "6a8e10e900245502244c";

const ENDPOINT =
  process.env.APPWRITE_FUNCTION_API_ENDPOINT ||
  "https://fra.cloud.appwrite.io/v1";


/* ======================================================
   CLIENTE APPWRITE
====================================================== */

const client =
  new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(
      process.env.APPWRITE_API_KEY || ""
    );


const tablesDB =
  new TablesDB(client);


/* ======================================================
   IDs DAS TABELAS
======================================================

   Banco:
   QuizUpDB

   Tabelas conhecidas:
   jogadores
   saques
   parceiros
   movimentacoes_parceiros
====================================================== */

const DATABASE_ID =
  process.env.QUIZUP_DATABASE_ID ||
  "QuizUpDB";

const TABELA_JOGADORES =
  process.env.TABELA_JOGADORES ||
  "jogadores";

const TABELA_SAQUES =
  process.env.TABELA_SAQUES ||
  "saques";


/* ======================================================
   FUNÇÕES AUXILIARES
====================================================== */

function resposta(
  body,
  statusCode = 200
) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}


function erro(
  mensagem,
  statusCode = 400
) {
  return resposta(
    {
      sucesso: false,
      erro: mensagem
    },
    statusCode
  );
}


function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}


function texto(valor) {
  return String(valor ?? "");
}


/* ======================================================
   LEITURA DAS TABELAS
====================================================== */

async function listarJogadores() {

  try {

    const resultado =
      await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABELA_JOGADORES,
        queries: [
          Query.limit(500)
        ]
      });

    return resultado.rows || [];

  } catch (e) {

    console.error(
      "Erro ao carregar jogadores:",
      e
    );

    return [];

  }
}


async function listarSaques() {

  try {

    const resultado =
      await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABELA_SAQUES,
        queries: [
          Query.limit(500)
        ]
      });

    return resultado.rows || [];

  } catch (e) {

    console.error(
      "Erro ao carregar saques:",
      e
    );

    return [];

  }
}


/* ======================================================
   RESUMO
====================================================== */

async function obterResumo() {

  const jogadores =
    await listarJogadores();

  const saques =
    await listarSaques();


  let pontosQuiz = 0;
  let pontosPatrocinados = 0;
  let pontosTotal = 0;

  let jogadoresAtivos = 0;


  for (
    const jogador of jogadores
  ) {

    const quiz =
      numero(
        jogador.pontosQuiz ??
        jogador.pontos ??
        0
      );

    const patrocinado =
      numero(
        jogador.pontosPatrocinados ??
        jogador.pontos_patrocinados ??
        0
      );

    const total =
      numero(
        jogador.pontosTotal ??
        (quiz + patrocinado)
      );


    pontosQuiz += quiz;

    pontosPatrocinados +=
      patrocinado;

    pontosTotal += total;


    const ativo =
      jogador.ativo !== false &&
      jogador.status !== "INATIVO";

    if (ativo) {
      jogadoresAtivos++;
    }

  }


  let saquesPendentes = 0;
  let saquesAprovados = 0;
  let saquesRecusados = 0;


  for (
    const saque of saques
  ) {

    const status =
      texto(
        saque.status
      ).toUpperCase();


    if (
      status === "PENDENTE"
    ) {
      saquesPendentes++;
    }

    if (
      status === "APROVADO"
    ) {
      saquesAprovados++;
    }

    if (
      status === "RECUSADO"
    ) {
      saquesRecusados++;
    }

  }


  return {

    usuarios:
      jogadores.length,

    jogadoresAtivos,

    pontosQuiz,

    pontosPatrocinados,

    pontosTotal,

    saquesPendentes,

    saquesAprovados,

    saquesRecusados

  };

}


/* ======================================================
   JOGADORES
====================================================== */

async function obterJogadores() {

  const jogadores =
    await listarJogadores();


  return jogadores.map(
    jogador => {

      const pontosQuiz =
        numero(
          jogador.pontosQuiz ??
          jogador.pontos ??
          0
        );


      const pontosPatrocinados =
        numero(
          jogador.pontosPatrocinados ??
          jogador.pontos_patrocinados ??
          0
        );


      const pontosTotal =
        numero(
          jogador.pontosTotal ??
          (pontosQuiz +
           pontosPatrocinados)
        );


      return {

        idJogador:
          jogador.$id ??
          jogador.idJogador ??
          jogador.id ??
          "",

        nome:
          jogador.nome ??
          "",

        email:
          jogador.email ??
          jogador["E-mail"] ??
          "",

        plano:
          jogador.plano ??
          "Grátis",

        pontosQuiz,

        pontosPatrocinados,

        pontosTotal,

        saldo:
          numero(
            jogador.equilibrio ??
            jogador.saldo ??
            0
          ),

        ativo:
          jogador.ativo !== false &&
          jogador.status !== "INATIVO"

      };

    }
  );

}


/* ======================================================
   SAQUES
====================================================== */

async function obterSaques() {

  const saques =
    await listarSaques();


  return saques.map(
    saque => {

      const pontos =
        numero(
          saque.pontos
        );


      const valorJogador =
        numero(
          saque.valor_jogador ??
          saque.valorJogador ??
          saque.quantia ??
          0
        );


      const valorPlataforma =
        numero(
          saque.valor_plataforma ??
          saque.valorPlataforma ??
          0
        );


      const custoTotal =
        numero(
          saque.custo_total ??
          saque.custoTotal ??
          (valorJogador +
           valorPlataforma)
        );


      return {

        id:
          saque.$id ??
          saque.id ??
          "",

        data:
          saque.criado_em ??
          saque.criadoEm ??
          saque.data ??
          "",

        nome:
          saque.nome ??
          "",

        idJogador:
          saque.id_usuario ??
          saque.idJogador ??
          saque.userId ??
          "",

        pontos,

        valorJogador,

        valorPlataforma,

        percentualPlataforma:
          numero(
            saque.percentual_plataforma ??
            saque.percentualPlataforma ??
            0
          ),

        custoTotal,

        tipo:
          saque.metodo ??
          saque.tipo ??
          "",

        destino:
          saque.pix_key ??
          saque.pixKey ??
          saque.email ??
          "",

        status:
          texto(
            saque.status ??
            "PENDENTE"
          ).toUpperCase()

      };

    }
  );

}


/* ======================================================
   AUTORIZAÇÃO
======================================================

   A função deve ser chamada pelo usuário autenticado.

   O painel deverá autenticar o administrador pelo Appwrite
   antes de chamar esta função.

====================================================== */

async function verificarAdministrador(req) {

  /*
   Nesta primeira camada verificamos o usuário autenticado
   enviado pelo Appwrite.

   A função deve estar configurada para permitir execução
   apenas pelo usuário administrador no console do Appwrite.
  */

  const userId =
    req.headers?.["x-appwrite-user-id"] ||
    req.headers?.["x-appwrite-user-id".toLowerCase()] ||
    "";

  if (!userId) {

    return {
      autorizado: false,
      userId: ""
    };

  }


  const ADMIN_USER_ID =
    process.env.ADMIN_USER_ID ||
    "6a8f41f10032758d44de";


  return {

    autorizado:
      userId === ADMIN_USER_ID,

    userId

  };

}


/* ======================================================
   EXECUÇÃO PRINCIPAL
====================================================== */

export default async function (
  req,
  res
) {

  try {

    console.log(
      "QuizUp Admin iniciado."
    );


    /*
     * O Appwrite pode fornecer o contexto do usuário
     * através dos cabeçalhos da execução.
     */

    const auth =
      await verificarAdministrador(
        req
      );


    /*
     * Para o primeiro teste da função, permitimos que
     * o próprio Appwrite execute a função.
     *
     * A proteção definitiva será feita pelo acesso da função
     * + usuário administrador.
     */

    if (
      req.path === "/teste" ||
      req.query?.teste === "1"
    ) {

      return res.json({

        sucesso: true,

        mensagem:
          "Função QuizUp Admin funcionando.",

        projeto:
          PROJECT_ID,

        usuario:
          auth.userId || null

      });

    }


    /* ==================================================
       ROTA RESUMO
    ================================================== */

    if (
      req.path === "/resumo" ||
      req.path === "/api/admin/resumo" ||
      req.method === "GET" &&
      req.path === "/"
    ) {

      const resumo =
        await obterResumo();


      return res.json({

        sucesso: true,

        ...resumo

      });

    }


    /* ==================================================
       ROTA JOGADORES
    ================================================== */

    if (
      req.path === "/jogadores" ||
      req.path === "/api/admin/jogadores"
    ) {

      const jogadores =
        await obterJogadores();


      return res.json({

        sucesso: true,

        jogadores

      });

    }


    /* ==================================================
       ROTA SAQUES
    ================================================== */

    if (
      req.path === "/saques" ||
      req.path === "/api/admin/saques"
    ) {

      const saques =
        await obterSaques();


      return res.json({

        sucesso: true,

        saques

      });

    }


    /* ==================================================
       ROTA PADRÃO
    ================================================== */

    return res.json({

      sucesso: true,

      mensagem:
        "QuizUp Admin Function online.",

      rotas: [

        "/teste",

        "/resumo",

        "/jogadores",

        "/saques"

      ]

    });


  } catch (e) {

    console.error(
      "ERRO NA FUNÇÃO QUIZUP ADMIN:",
      e
    );


    return res.json(
      {
        sucesso: false,
        erro:
          e?.message ||
          "Erro interno da função."
      },
      500
    );

  }

}
