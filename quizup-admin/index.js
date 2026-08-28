export default async ({ req, res, log, error }) => {
  try {
    log("QuizUp Admin iniciado");

    return res.json({
      ok: true,
      message: "QuizUp Admin funcionando!"
    });
  } catch (e) {
    error(e.message);

    return res.json({
      ok: false,
      message: "Erro interno"
    }, 500);
  }
};
