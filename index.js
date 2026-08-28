export default async ({ req, res, log, error }) => {
  log("QuizUp Admin iniciado");

  return res.json({
    ok: true,
    message: "QuizUp Admin funcionando!"
  });
};
