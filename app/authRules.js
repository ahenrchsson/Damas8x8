const PASSWORD_REGEX_SOURCE = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[A-Za-z\\d]{8,}$";
const PASSWORD_RULE_MESSAGE =
  "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.";
const USERNAME_REGEX_SOURCE = "^[a-zA-Z0-9_-]+$";

module.exports = {
  PASSWORD_REGEX_SOURCE,
  PASSWORD_RULE_MESSAGE,
  USERNAME_REGEX_SOURCE
};
