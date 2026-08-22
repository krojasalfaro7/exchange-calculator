---
name: git-push-develop
description: Stage, commit, and push changes to the develop branch of exchange-calculator (git@github.com:krojasalfaro7/exchange-calculator.git). Use when asked to "push to develop", "commit and push", "sync develop", "subir cambios", or "hacer push".
---

# Push a develop

Este repo es de un solo desarrollador con `develop` como rama principal
(`origin/develop`, remoto `git@github.com:krojasalfaro7/exchange-calculator.git`).
No hay CI ni PR obligatorio: el flujo normal es commitear directo en
`develop` y hacer push. No hay build/servidor que lanzar aquí — el
"driver" es `git` mismo, invocado con `Bash`.

## Antes de nada: confirmar con el usuario

`git push` afecta un repositorio compartido/remoto. Sigue el protocolo
de seguridad de git ya establecido para esta sesión: **nunca hagas
push sin que el usuario lo haya pedido explícitamente para ese cambio
concreto** (una aprobación anterior no cubre cambios nuevos). Si el
usuario solo pidió "commitea esto", commitea y **pregunta** antes de
subir.

## Pasos (verificados en este repo)

1. **Estado y diff, en paralelo:**

   ```bash
   git status --short
   git diff
   git log --oneline -5
   ```

   Revisa que no haya archivos sospechosos (`.env`, credenciales) antes
   de agregar nada.

2. **Confirmar que estás en `develop` y que está al día con el remoto:**

   ```bash
   git branch -vv
   git fetch origin develop
   git status --short --branch
   ```

   Si `develop` local está detrás de `origin/develop`, avisa al usuario
   y decide si hace falta `git pull` antes de seguir (no lo hagas de
   forma automática si hay commits locales sin subir todavía).

3. **Agregar solo los archivos relevantes** (nunca `git add -A` a
   ciegas):

   ```bash
   git add <archivo1> <archivo2>
   git status --short
   ```

4. **Commit con mensaje via heredoc** (nunca `-m "texto"` simple, para
   evitar problemas de escaping y permitir mensajes multilínea):

   ```bash
   git commit -m "$(cat <<'EOF'
   Resumen corto del cambio en imperativo.

   Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
   EOF
   )"
   ```

5. **Push** (solo tras confirmación explícita del usuario para *este*
   cambio):

   ```bash
   git push origin develop
   ```

   Nunca `--force` / `--force-with-lease` sobre `develop` a menos que
   el usuario lo pida explícitamente y entienda el riesgo.

6. **Verificar:**

   ```bash
   git status --short
   git log --oneline -3
   ```

## Reglas duras (no negociables)

- Nunca `--no-verify` / `--no-gpg-sign` salvo pedido explícito.
- Nunca `git reset --hard`, `git push --force` a `develop`, ni
  `git clean -f` sin pedido explícito y confirmación.
- Siempre commits nuevos, nunca `--amend`, salvo pedido explícito.
- Si un pre-commit hook falla: arregla la causa, vuelve a `git add`, y
  crea un commit nuevo (no reintentes con `--no-verify`).
- Si `git status` antes de empezar ya muestra cambios sin relación con
  la tarea actual, no los incluyas en el commit sin preguntar.

## Troubleshooting

- **`git push` pide credenciales / falla con permission denied
  (publickey):** el remoto es SSH (`git@github.com:...`). Si no hay
  agente SSH configurado en el contenedor, avísale al usuario — no es
  algo que se resuelva reintentando el push.
- **`develop` divergió de `origin/develop`:** no hagas merge/rebase
  automático sin confirmar con el usuario qué side prevalece.
