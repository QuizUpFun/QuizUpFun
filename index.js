const sdk = require("node-appwrite");
const crypto = require("crypto");

/*
========================================================
 QUIZUP ADMIN - BACKEND
 Compatível com Node 26 / Appwrite Functions

 LOGIN:
 E-mail + Data de nascimento

 SEGURANÇA:
 - Data de nascimento somente em variável de ambiente
 - Token administrativo assinado no backend
 - Token com expiração
 - Rotas administrativas protegidas
========================================================
*/

const {
  Client,
  TablesDB,
  Query
} = sdk;


/*
========================================================
 CONFIGURAÇÃO
========================================================
*/

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT ||
  "https://fra.cloud.appwrite.io/v1";

const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  "6a8e10e900245502244c";

const API_KEY =
  process.env.APPWRITE_API_KEY || "";

const ADMIN_USER_ID =
  process.env.ADMIN_USER_ID ||
  "6a8f41f10032758d44de";

const DATABASE_ID =
  process.env.DATABASE_ID ||
  "QuizUpDB";

const JOGADORES_TABLE_ID =
  process.env.JOGADORES_TABLE_ID ||
  "jogadores";

const SAQUES_TABLE_ID =
  process.env.SAQUES_TABLE_ID ||
  "saques";

const MENSAGENS_TABLE_ID =
  process.env.MENSAGENS_TABLE_ID ||
  "mensagens";


/*
========================================================
 LOGIN ADMINISTRATIVO
========================================================

 IMPORTANTE:
 NÃO coloque a data de nascimento aqui.

 Configure no Appwrite:

 ADMIN_EMAIL
 ADMIN_DATA_NASCIMENTO
 ADMIN_LOGIN_SECRET

 Exemplo:

 ADMIN_EMAIL=castrole334@gmail.com
 ADMIN_DATA_NASCIMENTO=AAAA-MM-DD
 ADMIN_LOGIN_SECRET=uma-chave-secreta-grande
========================================================
*/

const ADMIN_EMAIL =
  String(
    process.env.ADMIN_EMAIL || ""
  )
  .trim()
  .toLowerCase();

const ADMIN_DATA_NASCIMENTO =
  String(
    process.env.ADMIN_DATA_NASCIMENTO || ""
  ).trim();

const ADMIN_LOGIN_SECRET =
  String(
    process.env.ADMIN_LOGIN_SECRET || ""
  );


/*
========================================================
 CONFIGURAÇÃO DO TOKEN
========================================================
*/

const TOKEN_DURACAO_SEGUNDOS =
  2 * 60 * 60; // 2 horas


/*
========================================================
 CLIENT APPWRITE
========================================================
*/

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID);

if (API_KEY) {
  client.setKey(API_KEY);
}

const tablesDB = new TablesDB(client);


/*
========================================================
 RESPOSTAS
========================================================
*/

function json(res, data, status = 200) {

  return res.json(
    data,
    status
  );

}


/*
========================================================
 PEGAR ID DO USUÁRIO APPWRITE
========================================================
*/

function getUserId(req) {

  const headers =
    req.headers || {};

  return (
    headers["x-appwrite-user-id"] ||
    headers["X-Appwrite-User-Id"] ||
    ""
  );

}


/*
========================================================
 NORMALIZAR E-MAIL
========================================================
*/

function normalizarEmail(email) {

  return String(
    email || ""
  )
  .trim()
  .toLowerCase();

}


/*
========================================================
 COMPARAÇÃO SEGURA
========================================================
*/

function comparacaoSegura(a, b) {

  const primeiro =
    Buffer.from(
      String(a || ""),
      "utf8"
    );

  const segundo =
    Buffer.from(
      String(b || ""),
      "utf8"
    );

  if (
    primeiro.length !==
    segundo.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    primeiro,
    segundo
  );

}


/*
========================================================
 CRIAR TOKEN ADMIN
========================================================

 Formato:

 payload.assinatura

 O payload contém:
 - usuário administrador
 - emissão
 - expiração
========================================================
*/

function criarTokenAdmin() {

  if (!ADMIN_LOGIN_SECRET) {

    throw new Error(
      "ADMIN_LOGIN_SECRET não configurado no Appwrite."
    );

  }


  const agora =
    Math.floor(
      Date.now() / 1000
    );

  const payload = {

    sub:
      ADMIN_USER_ID,

    iat:
      agora,

    exp:
      agora +
      TOKEN_DURACAO_SEGUNDOS

  };


  const payloadTexto =
    Buffer.from(
      JSON.stringify(payload),
      "utf8"
    ).toString(
      "base64url"
    );


  const assinatura =
    crypto
      .createHmac(
        "sha256",
        ADMIN_LOGIN_SECRET
      )
      .update(
        payloadTexto
      )
      .digest(
        "base64url"
      );


  return (
    payloadTexto +
    "." +
    assinatura
  );

}


/*
========================================================
 VALIDAR TOKEN ADMIN
========================================================
*/

function validarTokenAdmin(token) {

  try {

    if (
      !token ||
      !ADMIN_LOGIN_SECRET
    ) {
      return {
        ok: false
      };
    }


    const partes =
      String(token).split(".");


    if (
      partes.length !== 2
    ) {
      return {
        ok: false
      };
    }


    const payloadTexto =
      partes[0];

    const assinaturaRecebida =
      partes[1];


    const assinaturaEsperada =
      crypto
        .createHmac(
          "sha256",
          ADMIN_LOGIN_SECRET
        )
        .update(
          payloadTexto
        )
        .digest(
          "base64url"
        );


    if (
      !comparacaoSegura(
        assinaturaRecebida,
        assinaturaEsperada
      )
    ) {

      return {
        ok: false
      };

    }


    const payload =
      JSON.parse(
        Buffer.from(
          payloadTexto,
          "base64url"
        ).toString(
          "utf8"
        )
      );


    const agora =
      Math.floor(
        Date.now() / 1000
      );


    if (
      !payload ||
      payload.sub !== ADMIN_USER_ID ||
      !payload.exp ||
      payload.exp <= agora
    ) {

      return {
        ok: false
      };

    }


    return {

      ok: true,

      userId:
        payload.sub

    };


  } catch (erro) {

    console.error(
      "Erro ao validar token:",
      erro.message
    );


    return {
      ok: false
    };

  }

}


/*
========================================================
 PEGAR TOKEN DO CABEÇALHO
========================================================
*/

function getAdminToken(req) {

  const headers =
    req.headers || {};

  const authorization =
    headers.authorization ||
    headers.Authorization ||
    "";


  if (
    !authorization
  ) {
    return "";
  }


  const prefixo =
    "Bearer ";


  if (
    !authorization.startsWith(
      prefixo
    )
  ) {

    return "";

  }


  return authorization
    .slice(
      prefixo.length
    )
    .trim();

}


/*
========================================================
 SEGURANÇA ADMIN
========================================================

 Aceita:

 1. Token administrativo criado pelo login

 OU

 2. Usuário Appwrite administrador

 A opção 2 mantém compatibilidade com
 chamadas autenticadas pelo Appwrite.
========================================================
*/

function verificarAdmin(req) {

  /*
   * Primeiro verifica token administrativo.
   */

  const token =
    getAdminToken(req);


  if (token) {

    const autenticacao =
      validarTokenAdmin(
        token
      );


    if (
      autenticacao.ok
    ) {

      return {

        ok: true,

        userId:
          autenticacao.userId

      };

    }

  }


  /*
   * Depois verifica usuário Appwrite.
   */

  const userId =
    getUserId(req);


  if (!userId) {

    return {

      ok: false,

      erro:
        "Usuário não autenticado."

    };

  }


  if (
    userId !==
    ADMIN_USER_ID
  ) {

    return {

      ok: false,

      erro:
        "Acesso negado. Usuário não autorizado."

    };

  }


  return {

    ok: true,

    userId

  };

}


/*
========================================================
 LOGIN ADMIN
========================================================
*/

async function loginAdmin(req, res) {

  try {

    /*
     * Nunca permitir login se as credenciais
     * administrativas não estiverem configuradas.
     */

    if (
      !ADMIN_EMAIL ||
      !ADMIN_DATA_NASCIMENTO ||
      !ADMIN_LOGIN_SECRET
    ) {

      console.error(
        "Credenciais administrativas não configuradas."
      );


      return json(
        res,
        {
          sucesso: false,
          erro:
            "Login administrativo não configurado no servidor."
        },
        500
      );

    }


    const body =
      req.bodyJson ||
      {};


    const email =
      normalizarEmail(
        body.email
      );


    const dataNascimento =
      String(
        body.dataNascimento ||
        ""
      ).trim();


    if (!email) {

      return json(
        res,
        {
          sucesso: false,
          erro:
            "E-mail não informado."
        },
        400
      );

    }


    if (!dataNascimento) {

      return json(
        res,
        {
          sucesso: false,
          erro:
            "Data de nascimento não informada."
        },
        400
      );

    }


    /*
     * Verificação feita SOMENTE no backend.
     */

    const emailCorreto =
      comparacaoSegura(
        email,
        ADMIN_EMAIL
      );


    const dataCorreta =
      comparacaoSegura(
        dataNascimento,
        ADMIN_DATA_NASCIMENTO
      );


    /*
     * Não informar qual dos dois dados
     * está errado.
     */

    if (
      !emailCorreto ||
      !dataCorreta
    ) {

      console.warn(
        "Tentativa de login administrativo inválida."
      );


      return json(
        res,
        {
          sucesso: false,
          erro:
            "E-mail ou data de nascimento incorretos."
        },
        401
      );

    }


    const token =
      criarTokenAdmin();


    return json(
      res,
      {

        sucesso: true,

        token,

        usuario: {

          id:
            ADMIN_USER_ID,

          email:
            ADMIN_EMAIL

        },

        expiraEm:
          TOKEN_DURACAO_SEGUNDOS

      }
    );


  } catch (erro) {

    console.error(
      "ERRO LOGIN ADMIN:",
      erro
    );


    return json(
      res,
      {
        sucesso: false,
        erro:
          "Erro interno durante o login."
      },
      500
    );

  }

}


/*
========================================================
 PRIMEIRO VALOR EXISTENTE
========================================================
*/

function valorDe(obj, nomes, padrao = "") {

  for (const nome of nomes) {

    if (
      obj &&
      obj[nome] !== undefined &&
      obj[nome] !== null
    ) {

      return obj[nome];

    }

  }

  return padrao;

}


/*
========================================================
 NORMALIZAR NÚMEROS
========================================================
*/

function num(valor) {

  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {
    return 0;
  }

  const numero =
    Number(valor);

  return Number.isFinite(numero)
    ? numero
    : 0;

}


/*
========================================================
 LISTAR LINHAS
========================================================
*/

async function listarTabela(
  tableId,
  queries = []
) {

  const resultado =
    await tablesDB.listRows({

      databaseId:
        DATABASE_ID,

      tableId:
        tableId,

      queries:
        queries,

      total:
        true

    });

  return resultado;

}


/*
========================================================
 RESUMO
========================================================
*/

async function resumo() {

  const jogadores =
    await listarTabela(
      JOGADORES_TABLE_ID
    );


  const saques =
    await listarTabela(
      SAQUES_TABLE_ID
    );


  let pontosQuiz = 0;
  let pontosPatrocinados = 0;
  let pontosTotal = 0;


  for (
    const jogador of
    jogadores.rows || []
  ) {

    const quiz =
      num(
        valorDe(
          jogador,
          [
            "pontosQuiz",
            "pontos_quiz",
            "pontos"
          ]
        )
      );


    const patrocinado =
      num(
        valorDe(
          jogador,
          [
            "pontosPatrocinados",
            "pontos_patrocinados"
          ]
        )
      );


    const total =
      num(
        valorDe(
          jogador,
          [
            "pontosTotal",
            "pontos_total"
          ],
          quiz + patrocinado
        )
      );


    pontosQuiz +=
      quiz;

    pontosPatrocinados +=
      patrocinado;

    pontosTotal +=
      total;

  }


  let saquesPendentes = 0;
  let saquesAprovados = 0;
  let saquesRecusados = 0;


  for (
    const saque of
    saques.rows || []
  ) {

    const status =
      String(
        valorDe(
          saque,
          ["status"],
          ""
        )
      ).toUpperCase();


    if (
      status === "PENDENTE"
    ) {

      saquesPendentes++;

    } else if (
      status === "APROVADO"
    ) {

      saquesAprovados++;

    } else if (
      status === "RECUSADO"
    ) {

      saquesRecusados++;

    }

  }


  return {

    usuarios:
      jogadores.total ||
      (jogadores.rows || []).length,

    jogadoresAtivos:
      (jogadores.rows || []).filter(
        jogador =>

          valorDe(
            jogador,
            [
              "ativo",
              "status"
            ],
            true
          ) !== false &&

          String(
            valorDe(
              jogador,
              ["status"],
              "ATIVO"
            )
          ).toUpperCase() !==
          "INATIVO"

      ).length,

    pontosQuiz,

    pontosPatrocinados,

    pontosTotal,

    saquesPendentes,

    saquesAprovados,

    saquesRecusados

  };

}


/*
========================================================
 JOGADORES
========================================================
*/

async function jogadores() {

  const resultado =
    await listarTabela(
      JOGADORES_TABLE_ID
    );


  const lista =
    (resultado.rows || [])
      .map(jogador => {

        const pontosQuiz =
          num(
            valorDe(
              jogador,
              [
                "pontosQuiz",
                "pontos_quiz",
                "pontos"
              ]
            )
          );


        const pontosPatrocinados =
          num(
            valorDe(
              jogador,
              [
                "pontosPatrocinados",
                "pontos_patrocinados"
              ]
            )
          );


        const pontosTotal =
          num(
            valorDe(
              jogador,
              [
                "pontosTotal",
                "pontos_total"
              ],
              pontosQuiz +
              pontosPatrocinados
            )
          );


        return {

          idJogador:
            valorDe(
              jogador,
              [
                "idJogador",
                "id_usuario",
                "$id"
              ]
            ),

          nome:
            valorDe(
              jogador,
              [
                "nome",
                "name"
              ],
              "-"
            ),

          email:
            valorDe(
              jogador,
              [
                "email",
                "E-mail",
                "e_mail"
              ],
              "-"
            ),

          plano:
            valorDe(
              jogador,
              [
                "plano",
                "Plano"
              ],
              "normal"
            ),

          pontosQuiz,

          pontosPatrocinados,

          pontosTotal,

          saldo:
            num(
              valorDe(
                jogador,
                [
                  "equilibrio",
                  "saldo",
                  "balance"
                ]
              )
            ),

          ativo:
            valorDe(
              jogador,
              [
                "ativo"
              ],
              true
            )

        };

      });


  return {

    jogadores:
      lista,

    total:
      resultado.total ||
      lista.length

  };

}


/*
========================================================
 SAQUES
========================================================
*/

async function saques() {

  const resultado =
    await listarTabela(
      SAQUES_TABLE_ID
    );


  const lista =
    (resultado.rows || [])
      .map(saque => {

        const valorJogador =
          num(
            valorDe(
              saque,
              [
                "valor_jogador",
                "valorJogador",
                "quantia"
              ]
            )
          );


        const valorPlataforma =
          num(
            valorDe(
              saque,
              [
                "valor_plataforma",
                "valorPlataforma"
              ]
            )
          );


        return {

          id:
            valorDe(
              saque,
              [
                "$id",
                "id",
                "idSaque"
              ]
            ),

          data:
            valorDe(
              saque,
              [
                "criado_em",
                "criadoEm",
                "data",
                "$createdAt"
              ]
            ),

          nome:
            valorDe(
              saque,
              [
                "nome"
              ],
              "-"
            ),

          idJogador:
            valorDe(
              saque,
              [
                "ID do usuário",
                "id_usuario",
                "idJogador",
                "usuario_id"
              ],
              "-"
            ),

          email:
            valorDe(
              saque,
              [
                "e-mail",
                "email",
                "E-mail"
              ],
              "-"
            ),

          pontos:
            num(
              valorDe(
                saque,
                [
                  "pontos"
                ]
              )
            ),

          valorJogador,

          valorPlataforma,

          custoTotal:
            valorJogador +
            valorPlataforma,

          percentualPlataforma:
            valorJogador > 0
              ? (
                  valorPlataforma /
                  valorJogador
                ) * 100
              : 0,

          tipo:
            valorDe(
              saque,
              [
                "método",
                "metodo",
                "tipo"
              ],
              "PIX"
            ),

          destino:
            valorDe(
              saque,
              [
                "pix_key",
                "pixKey",
                "destino"
              ],
              "-"
            ),

          status:
            String(
              valorDe(
                saque,
                ["status"],
                "PENDENTE"
              )
            ).toUpperCase()

        };

      });


  return {

    saques:
      lista

  };

}


/*
========================================================
 ATUALIZAR SAQUE
========================================================
*/

async function atualizarSaque(
  idSaque,
  status,
  motivo = ""
) {

  if (!idSaque) {

    throw new Error(
      "ID do saque não informado."
    );

  }


  const dados = {
    status:
      status
  };


  if (motivo) {

    dados.motivo =
      motivo;

  }


  return await tablesDB.updateRow({

    databaseId:
      DATABASE_ID,

    tableId:
      SAQUES_TABLE_ID,

    rowId:
      idSaque,

    data:
      dados

  });

}


/*
========================================================
 MENSAGENS SAC
========================================================
*/

async function mensagens() {

  try {

    const resultado =
      await listarTabela(
        MENSAGENS_TABLE_ID
      );


    return {

      mensagens:
        (resultado.rows || [])
          .map(mensagem => ({

            id:
              valorDe(
                mensagem,
                [
                  "$id",
                  "id"
                ]
              ),

            email:
              valorDe(
                mensagem,
                [
                  "email",
                  "e-mail",
                  "E-mail"
                ],
                "-"
              ),

            mensagem:
              valorDe(
                mensagem,
                [
                  "mensagem",
                  "texto"
                ],
                ""
              ),

            data:
              valorDe(
                mensagem,
                [
                  "criado_em",
                  "data",
                  "$createdAt"
                ]
              ),

            status:
              String(
                valorDe(
                  mensagem,
                  [
                    "status"
                  ],
                  "NOVA"
                )
              ).toUpperCase()

          }))

    };

  } catch (erro) {

    console.error(
      "Tabela de mensagens:",
      erro.message
    );


    return {

      mensagens: []

    };

  }

}


/*
========================================================
 MARCAR MENSAGEM COMO LIDA
========================================================
*/

async function marcarMensagemLida(
  idMensagem
) {

  if (!idMensagem) {

    throw new Error(
      "ID da mensagem não informado."
    );

  }


  return await tablesDB.updateRow({

    databaseId:
      DATABASE_ID,

    tableId:
      MENSAGENS_TABLE_ID,

    rowId:
      idMensagem,

    data: {

      status:
        "LIDA"

    }

  });

}


/*
========================================================
 HANDLER PRINCIPAL
========================================================
*/

async function main(req, res) {

  try {

    console.log(
      "QuizUp Admin iniciado."
    );


    console.log(
      "Path:",
      req.path
    );


    const path =
      req.path || "/";

    const method =
      String(
        req.method || "GET"
      ).toUpperCase();


    /*
     * TESTE
     */

    if (
      path === "/" ||
      path === "/teste"
    ) {

      return json(
        res,
        {

          sucesso: true,

          mensagem:
            "QuizUp Admin funcionando.",

          function:
            "quizup-admin",

          runtime:
            "node-26",

          appwrite:
            true

        }
      );

    }


    /*
     * LOGIN
     *
     * Esta rota NÃO exige token,
     * pois ela é responsável por criá-lo.
     */

    if (
      path === "/api/admin/login" &&
      method === "POST"
    ) {

      return await loginAdmin(
        req,
        res
      );

    }


    /*
     * LOGOUT
     *
     * O token é stateless, portanto
     * o frontend simplesmente deve apagá-lo.
     */

    if (
      path === "/api/admin/logout" &&
      method === "POST"
    ) {

      return json(
        res,
        {
          sucesso: true,
          mensagem:
            "Sessão encerrada."
        }
      );

    }


    /*
     * TODAS AS ROTAS ABAIXO
     * EXIGEM AUTENTICAÇÃO ADMIN.
     */

    const seguranca =
      verificarAdmin(req);


    if (
      !seguranca.ok
    ) {

      return json(
        res,
        {

          sucesso: false,

          erro:
            seguranca.erro ||
            "Não autorizado."

        },
        401
      );

    }


    /*
     * RESUMO
     */

    if (
      path ===
      "/api/admin/resumo"
    ) {

      return json(
        res,
        await resumo()
      );

    }


    /*
     * JOGADORES
     */

    if (
      path ===
      "/api/admin/jogadores"
    ) {

      return json(
        res,
        await jogadores()
      );

    }


    /*
     * SAQUES
     */

    if (
      path ===
      "/api/admin/saques"
    ) {

      return json(
        res,
        await saques()
      );

    }


    /*
     * APROVAR SAQUE
     */

    if (
      path ===
        "/api/admin/saque/aprovar" &&
      method === "POST"
    ) {

      const body =
        req.bodyJson ||
        {};


      const idSaque =
        body.idSaque;


      await atualizarSaque(
        idSaque,
        "APROVADO"
      );


      return json(
        res,
        {

          sucesso: true,

          mensagem:
            "Saque aprovado."

        }
      );

    }


    /*
     * RECUSAR SAQUE
     */

    if (
      path ===
        "/api/admin/saque/recusar" &&
      method === "POST"
    ) {

      const body =
        req.bodyJson ||
        {};


      const idSaque =
        body.idSaque;


      const motivo =
        body.motivo ||
        "Solicitação recusada pelo administrador.";


      await atualizarSaque(
        idSaque,
        "RECUSADO",
        motivo
      );


      return json(
        res,
        {

          sucesso: true,

          mensagem:
            "Saque recusado."

        }
      );

    }


    /*
     * MENSAGENS
     */

    if (
      path ===
      "/api/admin/mensagens"
    ) {

      return json(
        res,
        await mensagens()
      );

    }


    /*
     * MARCAR MENSAGEM COMO LIDA
     */

    if (
      path ===
        "/api/admin/mensagem/lida" &&
      method === "POST"
    ) {

      const body =
        req.bodyJson ||
        {};


      await marcarMensagemLida(
        body.idMensagem
      );


      return json(
        res,
        {

          sucesso: true,

          mensagem:
            "Mensagem marcada como lida."

        }
      );

    }


    /*
     * ROTA NÃO ENCONTRADA
     */

    return json(
      res,
      {

        sucesso: false,

        erro:
          "Rota não encontrada.",

        path

      },
      404
    );


  } catch (erro) {

    console.error(
      "ERRO QUIZUP ADMIN:",
      erro
    );


    return json(
      res,
      {

        sucesso: false,

        erro:
          erro.message ||
          "Erro interno da função."

      },
      500
    );

  }

}


/*
========================================================
 EXPORTAÇÃO
========================================================
*/

module.exports = {
  main
};
