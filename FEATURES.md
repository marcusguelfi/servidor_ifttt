# FEATURES — PC Control System

Histórico de features implementadas e suas decisões técnicas.

---

## Feature: Fullscreen split + Fix VGA cinema + Claude-yes + .gitignore
**Status:** implementada
**Data:** 2026-02-23
**Arquivos:**
- `pc-control-system/client/pc_client.py`
- `pc-control-system/web/index.html`
- `pc-control-system/matter-bridge/devices.json`
- `pc-control-system/client/tests/test_pc_client.py`
- `.gitignore`

### O que faz
Separa fullscreen em dois comandos (F para vídeo, F11 para janela), corrige bug onde modo cinema mantinha o monitor VGA ligado, adiciona comando "Dizer sim ao Claude" para confirmar prompts via Alexa, e cria `.gitignore` com regras de segurança.

### Interface

**Fullscreen split (pc_client.py + web):**
```python
'fullscreen'       → pyautogui.press('f11')   # fullscreen da janela/aba (Brave)
'video-fullscreen' → pyautogui.press('f')      # fullscreen do player (YouTube/Netflix)
```
```html
<!-- web/index.html — seção Modos -->
<button onclick="cmd('fullscreen')">Tela Cheia</button>
<button onclick="cmd('video-fullscreen')">Vídeo Full</button>
```

**Fix VGA cinema/night (pc_client.py):**
```python
# cinema_mode e night_mode:
subprocess.Popen(["DisplaySwitch.exe", "/external"])
# era /internal — mantinha VGA (primeiro monitor detectado pelo hardware)
```

**Claude-yes (pc_client.py):**
```python
await client.handle_command('claude-yes', {})
# Busca janela "Claude"/"Windows Terminal"/"cmd", traz para frente, pressiona Enter
```

**devices.json:**
```json
{ "name": "Dizer sim ao Claude", "command": "claude-yes" }
```

### Testes
- `test_deve_pressionar_f_quando_video_fullscreen` — F pressionado para video-fullscreen
- `test_deve_pressionar_f11_quando_fullscreen_janela` — F11 mantido para fullscreen
- `test_deve_chamar_displayswitch_external_quando_cinema_mode` — /external no cinema
- `test_nao_deve_chamar_displayswitch_internal_no_cinema_mode` — /internal não aparece
- `test_deve_chamar_displayswitch_external_quando_night_mode` — /external no night
- `test_deve_chamar_displayswitch_extend_quando_dual_monitor` — /extend inalterado
- `test_deve_pressionar_enter_quando_claude_yes` — Enter enviado
- `test_deve_buscar_janela_claude_antes_do_enter` — _find_window_by_title chamado

### Decisões técnicas
- Escolhemos `DisplaySwitch /external` em vez de `/internal` porque em desktop (sem tela nativa), `/internal` mantém o primeiro monitor detectado pelo hardware (VGA, porta física), ignorando a configuração de "primário" do Windows; `/external` mantém o segundo detectado (TV/HDMI)
- Escolhemos buscar por título de janela em vez de processo porque o Claude Code roda dentro do Windows Terminal — o processo-pai é `WindowsTerminal.exe`, não `claude.exe`

### Próximos passos
- [ ] Feedback visual na web ao ativar modo cinema (ícone ativo)
- [ ] Testar "Dizer sim ao Claude" via Alexa com frase exata em PT-BR

---

## Feature: Fix mouse-move / audio-buttons / TTS
**Status:** implementada
**Data:** 2026-02-23
**Arquivos:**
- `pc-control-system/client/pc_client.py`
- `pc-control-system/client/requirements.txt`
- `pc-control-system/web/index.html`
- `pc-control-system/client/tests/test_pc_client.py`

### O que faz
Corrige três bugs que impediam o funcionamento do mouse web, dos botões de saída de áudio e do TTS. Adiciona cobertura de testes unitários para os três comportamentos.

### Interface

**Mouse (pc_client.py):**
```python
# Comandos via handle_command:
'mouse-move'   → pyautogui.moveRel(dx, dy, duration=0)
'mouse-click'  → pyautogui.click(button='left'|'right'|'middle')
'mouse-scroll' → pyautogui.scroll(delta)
```

**TTS:**
```python
await client.text_to_speech("Olá mundo")
# Gera MP3 via edge_tts e reproduz com playsound (bloqueante em thread)
```

**Áudio (web):**
```javascript
// Botão usa data-dev para evitar quebra de HTML com aspas
<button data-dev="Nome do Device" onclick="switchAudio(this)">
function switchAudio(el) { cmd('set-audio-device', { device: el.dataset.dev }); }
```

### Testes
- `test_deve_mover_mouse_quando_mouse_move_com_deltas_validos` — moveRel chamado com dx/dy corretos
- `test_deve_mover_mouse_com_zero_quando_params_ausentes` — default 0,0
- `test_deve_converter_float_para_int_no_mouse_move` — trunca floats
- `test_deve_clicar_esquerdo_quando_button_left` — click('left')
- `test_deve_clicar_direito_quando_button_right` — click('right')
- `test_deve_usar_left_como_default_quando_button_ausente` — default left
- `test_deve_rolar_para_cima_quando_delta_positivo` — scroll(3)
- `test_deve_rolar_para_baixo_quando_delta_negativo` — scroll(-3)
- `test_deve_desabilitar_failsafe_do_pyautogui` — FAILSAFE is False
- `test_deve_desabilitar_pause_do_pyautogui` — PAUSE == 0
- `test_deve_trocar_audio_quando_device_encontrado_por_substring` — SetDefaultEndpoint x3 roles
- `test_deve_usar_match_case_insensitive_no_audio` — match case insensitive
- `test_deve_lancar_excecao_quando_device_nao_encontrado` — Exception com msg
- `test_deve_ignorar_tts_quando_texto_vazio` — guard de texto vazio
- `test_deve_chamar_playsound_quando_tts_com_texto` — playsound chamado
- `test_deve_deletar_arquivo_temp_apos_tts` — os.unlink após play

### Decisões técnicas
- Escolhemos `playsound` em vez de `pygame` para TTS porque `pygame` exige subsistema de display e falha silenciosamente sem device de áudio configurado; `playsound` usa WinAPI diretamente, sem init, zero config
- Escolhemos `asyncio.to_thread(playsound, tmp)` em vez de chamar diretamente porque `playsound` é bloqueante — evita travar o event loop
- Escolhemos `data-dev` attribute HTML em vez de `JSON.stringify` em `onclick=""` porque aspas duplas no nome do device quebravam o atributo HTML
- `pyautogui.FAILSAFE = False` e `PAUSE = 0` são necessários para mouse-move contínuo: `FAILSAFE=True` lança exceção quando cursor nos cantos; `PAUSE=0.1` adiciona 100ms por chamada tornando o touchpad inutilizável

### Próximos passos
- [ ] Testes E2E via Playwright para validar os botões de áudio no navegador
- [ ] Feedback visual no botão de áudio ativo (highlight do device em uso)

---

## Feature: Mouse Touchpad + Fullscreen + Discos Múltiplos + Áudio Buttons
**Status:** implementada
**Data:** 2026-02-23
**Arquivos:**
- `pc-control-system/client/pc_client.py`
- `pc-control-system/web/index.html`

### O que faz
Adiciona controle de mouse via touchpad web, comando de tela cheia (F11), exibição de todos os discos físicos na barra de sistema, botões de saída de áudio dinâmicos e layout responsivo para mobile.

### Interface
```
Touchpad: arrastar = mover mouse, tap < 200ms = clique esquerdo
Comando 'fullscreen': pyautogui.press('f11')
System info: campo 'disks' com array de todos os discos (mount, percent, used_gb, total_gb)
Áudio: botões dinâmicos gerados a partir dos devices ativos
```

### Decisões técnicas
- Touchpad usa `pointer events` (funciona em touch e mouse) com `setPointerCapture` para rastrear movimento fora do elemento
- Movimentos acumulados a cada 30ms em vez de envio imediato — evita flood de requests
- Discos mantêm campos legados `disk_percent/used_gb/total_gb` (primeiro disco) para retrocompatibilidade com Matter bridge
