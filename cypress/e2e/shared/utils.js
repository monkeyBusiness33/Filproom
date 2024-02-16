module.exports.generateRandomString = (length) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
};
