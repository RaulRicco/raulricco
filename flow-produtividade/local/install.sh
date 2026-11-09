#!/usr/bin/env bash
# Instala o Flow Produtividade local (CLI "flow" + servidor MCP) em ~/.flow
# Uso: bash install.sh            (instala/atualiza)
#      bash install.sh --no-login (não pede login no final)
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FLOW_HOME="${FLOW_HOME:-$HOME/.flow}"
BIN_DIR="$HOME/.local/bin"

if ! command -v node >/dev/null 2>&1; then
  echo "Erro: Node.js 18+ é necessário (https://nodejs.org ou: brew install node)." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Erro: Node.js $NODE_MAJOR encontrado; é preciso 18 ou mais novo." >&2
  exit 1
fi

mkdir -p "$FLOW_HOME/app" "$BIN_DIR"
chmod 700 "$FLOW_HOME"
cp "$SRC/lib.mjs" "$SRC/flow.mjs" "$SRC/mcp.mjs" "$FLOW_HOME/app/"
cp "$SRC/AGENT.md" "$FLOW_HOME/AGENT.md"
chmod +x "$FLOW_HOME/app/flow.mjs" "$FLOW_HOME/app/mcp.mjs"

NODE_BIN="$(command -v node)"
cat > "$BIN_DIR/flow" <<EOF
#!/usr/bin/env bash
exec "$NODE_BIN" "$FLOW_HOME/app/flow.mjs" "\$@"
EOF
cat > "$BIN_DIR/flow-mcp" <<EOF
#!/usr/bin/env bash
exec "$NODE_BIN" "$FLOW_HOME/app/mcp.mjs" "\$@"
EOF
chmod +x "$BIN_DIR/flow" "$BIN_DIR/flow-mcp"

# Garante ~/.local/bin no PATH (zsh é o padrão do macOS)
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    RC="$HOME/.zprofile"
    if ! grep -qs 'flow-produtividade PATH' "$RC"; then
      printf '\n# flow-produtividade PATH\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$RC"
      echo "Adicionei ~/.local/bin ao PATH em $RC (abra um novo Terminal para valer)."
    fi
    export PATH="$BIN_DIR:$PATH"
    ;;
esac

echo "Flow instalado em $FLOW_HOME"
echo "  CLI:  $BIN_DIR/flow"
echo "  MCP:  $BIN_DIR/flow-mcp   (ou: $NODE_BIN $FLOW_HOME/app/mcp.mjs)"
echo "  Guia para o assistente: $FLOW_HOME/AGENT.md"

if [ "${1:-}" != "--no-login" ] && [ ! -s "$FLOW_HOME/config.json" ] && [ -t 0 ]; then
  echo
  echo "Conectando à sua conta (gera uma chave de API permanente; revogável em Integrações no app)…"
  "$BIN_DIR/flow" login
fi
