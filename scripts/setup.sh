#!/usr/bin/env bash
# Crea el archivo .env con secretos aleatorios (Linux, macOS, WSL, Git Bash).
#
#   ./scripts/setup.sh            # pregunta usuario y contraseña
#   ./scripts/setup.sh --force    # reemplaza un .env existente
#
# Sin terminal interactiva (CI): usa AUTH_USERNAME / AUTH_PASSWORD del entorno o los genera.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
example="$root/.env.example"
target="$root/.env"

hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    node -e "console.log(require('crypto').randomBytes($1).toString('hex'))"
  fi
}

safe() {
  # Compose interpreta $ y # en .env; comillas, espacios y \ también causan problemas.
  [[ ! "$1" =~ [[:space:]\$\#\"\'\`\\] ]]
}

[[ -f "$example" ]] || { echo "No se encontró .env.example en $root" >&2; exit 1; }
if [[ -f "$target" && "${1:-}" != "--force" ]]; then
  echo ".env ya existe; no se modificó. Usa --force para reemplazarlo."
  exit 0
fi

echo "Configuración de Whole Platport Lite"
user="${AUTH_USERNAME:-}"
password="${AUTH_PASSWORD:-}"
if [[ -t 0 ]]; then
  read -rp "Usuario para entrar a la app [alumno]: " user
  read -rsp "Contraseña (mínimo 8 caracteres; Enter para generar una): " password
  echo
fi
user="${user:-alumno}"
safe "$user" || { echo "El usuario no puede tener espacios ni los caracteres \$ # \" ' \` \\" >&2; exit 1; }

generated=0
if [[ -z "$password" ]]; then
  password="$(hex 8)"
  generated=1
fi
(( ${#password} >= 8 )) || { echo "La contraseña debe tener al menos 8 caracteres." >&2; exit 1; }
safe "$password" || { echo "La contraseña no puede tener espacios ni los caracteres \$ # \" ' \` \\" >&2; exit 1; }

AUTH_USERNAME="$user" AUTH_PASSWORD="$password" AUTH_SECRET="$(hex 32)" POSTGRES_PASSWORD="$(hex 16)" \
  awk -F= '
    /^AUTH_USERNAME=/     { print "AUTH_USERNAME=" ENVIRON["AUTH_USERNAME"]; next }
    /^AUTH_PASSWORD=/     { print "AUTH_PASSWORD=" ENVIRON["AUTH_PASSWORD"]; next }
    /^AUTH_SECRET=/       { print "AUTH_SECRET=" ENVIRON["AUTH_SECRET"]; next }
    /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD=" ENVIRON["POSTGRES_PASSWORD"]; next }
    { print }
  ' "$example" > "$target"
chmod 600 "$target"

echo
echo ".env creado."
echo "  Usuario:    $user"
if (( generated )); then
  echo "  Contraseña: $password   (generada; guárdala, no se vuelve a mostrar)"
else
  echo "  Contraseña: la que escribiste"
fi
echo
echo "Siguiente paso:  docker compose up -d --build   y abre http://localhost:3000"
