#!/bin/bash

# Script de Teste da API PC Control
# Execute: bash test_api.sh SEU_IP_SERVIDOR

if [ -z "$1" ]; then
    echo "Uso: $0 <IP_DO_SERVIDOR>"
    echo "Exemplo: $0 192.168.1.100"
    exit 1
fi

SERVER_IP=$1
API_URL="http://$SERVER_IP:3000"

echo "=========================================="
echo "  TESTE DA API PC CONTROL"
echo "=========================================="
echo "Servidor: $API_URL"
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função de teste
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    
    echo -n "Testando $name... "
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL$endpoint")
    else
        response=$(curl -s -o /dev/null -w "%{http_code}" -X $method \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$API_URL$endpoint")
    fi
    
    if [ "$response" == "200" ]; then
        echo -e "${GREEN}✓ OK${NC} (HTTP $response)"
    else
        echo -e "${RED}✗ FALHOU${NC} (HTTP $response)"
    fi
}

# Teste 1: Health Check
echo "1. Health Check"
test_endpoint "Health" "GET" "/api/health"
echo ""

# Teste 2: Listar PCs
echo "2. Listar PCs Conectados"
echo "GET $API_URL/api/pcs"
response=$(curl -s "$API_URL/api/pcs")
echo "Resposta: $response"
echo ""

# Se houver PCs conectados, pegar o primeiro MAC
if command -v jq &> /dev/null; then
    MAC=$(echo $response | jq -r '.[0].macAddress // empty')
    if [ ! -z "$MAC" ]; then
        echo -e "${GREEN}PC encontrado: $MAC${NC}"
        echo ""
        
        # Testes com o PC
        echo "3. Testes de Comandos"
        
        # Teste de volume
        test_endpoint "Volume 50%" "POST" "/api/command/$MAC" '{"command":"set-volume","params":{"volume":50}}'
        
        # Teste de app
        test_endpoint "Abrir App" "POST" "/api/command/$MAC" '{"command":"open-app","params":{"app":"youtube"}}'
        
        # Teste de modo cinema
        test_endpoint "Modo Cinema" "POST" "/api/webhook/$MAC/cinema-mode"
        
        echo ""
        echo -e "${YELLOW}Nota: Verifique o cliente Windows para ver se os comandos foram recebidos!${NC}"
    else
        echo -e "${YELLOW}Nenhum PC conectado ainda.${NC}"
        echo "Inicie o cliente no seu PC Windows!"
    fi
else
    echo -e "${YELLOW}Instale 'jq' para testes automáticos de comandos${NC}"
    echo "sudo apt install jq"
fi

echo ""
echo "=========================================="
echo "  TESTES CONCLUÍDOS"
echo "=========================================="
echo ""
echo "URLs Úteis:"
echo "  Dashboard: $API_URL"
echo "  API Docs:  $API_URL/api/health"
echo "  PCs:       $API_URL/api/pcs"
echo ""
echo "Exemplo de webhook IFTTT:"
echo "  POST $API_URL/api/webhook/MAC_ADDRESS/shutdown"
echo "  Body: {\"delay\": 60}"
echo ""
