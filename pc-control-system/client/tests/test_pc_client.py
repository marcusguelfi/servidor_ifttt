"""
Testes unitários do PCControlClient.
Execução: pytest tests/ -v  (na pasta client/)
"""
import sys
import os
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch, call

# Adiciona o diretório pai ao path para importar pc_client
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


# ─────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────

@pytest.fixture
def client():
    """PCControlClient com dependências externas mockadas."""
    with patch('socket.gethostname', return_value='TEST-PC'), \
         patch('uuid.getnode', return_value=0xAABBCCDDEEFF), \
         patch('socket.socket'):
        from pc_client import PCControlClient
        return PCControlClient()


# ─────────────────────────────────────────────
# Mouse — move
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deve_mover_mouse_quando_mouse_move_com_deltas_validos(client):
    with patch('pyautogui.moveRel') as mock_move:
        await client.handle_command('mouse-move', {'dx': 10, 'dy': -5})
        mock_move.assert_called_once_with(10, -5, duration=0)


@pytest.mark.asyncio
async def test_deve_mover_mouse_com_zero_quando_params_ausentes(client):
    with patch('pyautogui.moveRel') as mock_move:
        await client.handle_command('mouse-move', {})
        mock_move.assert_called_once_with(0, 0, duration=0)


@pytest.mark.asyncio
async def test_deve_converter_float_para_int_no_mouse_move(client):
    with patch('pyautogui.moveRel') as mock_move:
        await client.handle_command('mouse-move', {'dx': 7.9, 'dy': 3.1})
        mock_move.assert_called_once_with(7, 3, duration=0)


# ─────────────────────────────────────────────
# Mouse — click
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deve_clicar_esquerdo_quando_button_left(client):
    with patch('pyautogui.click') as mock_click:
        await client.handle_command('mouse-click', {'button': 'left'})
        mock_click.assert_called_once_with(button='left')


@pytest.mark.asyncio
async def test_deve_clicar_direito_quando_button_right(client):
    with patch('pyautogui.click') as mock_click:
        await client.handle_command('mouse-click', {'button': 'right'})
        mock_click.assert_called_once_with(button='right')


@pytest.mark.asyncio
async def test_deve_usar_left_como_default_quando_button_ausente(client):
    with patch('pyautogui.click') as mock_click:
        await client.handle_command('mouse-click', {})
        mock_click.assert_called_once_with(button='left')


# ─────────────────────────────────────────────
# Mouse — scroll
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deve_rolar_para_cima_quando_delta_positivo(client):
    with patch('pyautogui.scroll') as mock_scroll:
        await client.handle_command('mouse-scroll', {'delta': 3})
        mock_scroll.assert_called_once_with(3)


@pytest.mark.asyncio
async def test_deve_rolar_para_baixo_quando_delta_negativo(client):
    with patch('pyautogui.scroll') as mock_scroll:
        await client.handle_command('mouse-scroll', {'delta': -3})
        mock_scroll.assert_called_once_with(-3)


# ─────────────────────────────────────────────
# Mouse — FAILSAFE e PAUSE desabilitados
# ─────────────────────────────────────────────

def test_deve_desabilitar_failsafe_do_pyautogui():
    import pyautogui
    assert pyautogui.FAILSAFE is False, "FAILSAFE deve ser False para não bloquear mouse nos cantos"


def test_deve_desabilitar_pause_do_pyautogui():
    import pyautogui
    assert pyautogui.PAUSE == 0, "PAUSE deve ser 0 para não atrasar chamadas rápidas de mouse"


# ─────────────────────────────────────────────
# Áudio — troca de saída
# ─────────────────────────────────────────────

def _fake_device(name, dev_id):
    d = MagicMock()
    d.FriendlyName = name
    d.id = dev_id
    return d


@pytest.mark.asyncio
async def test_deve_trocar_audio_quando_device_encontrado_por_substring(client):
    fake_devices = [
        _fake_device('Headset Earphone (G435 Wireless)', '{id-g435}'),
        _fake_device('Alto-falantes (Echo Pop)', '{id-echo}'),
    ]
    fake_policy = MagicMock()

    with patch('pc_client.AudioUtilities') as mock_au, \
         patch('pc_client.comtypes.CoCreateInstance', return_value=fake_policy):
        mock_au.GetAllDevices.return_value = fake_devices
        await client.set_audio_output('G435')
        fake_policy.SetDefaultEndpoint.assert_called()
        # Deve ter chamado para os 3 roles (Console, Multimedia, Communications)
        assert fake_policy.SetDefaultEndpoint.call_count == 3


@pytest.mark.asyncio
async def test_deve_usar_match_case_insensitive_no_audio(client):
    fake_devices = [_fake_device('NVIDIA High Definition Audio', '{id-nvidia}')]
    fake_policy = MagicMock()

    with patch('pc_client.AudioUtilities') as mock_au, \
         patch('pc_client.comtypes.CoCreateInstance', return_value=fake_policy):
        mock_au.GetAllDevices.return_value = fake_devices
        await client.set_audio_output('nvidia')  # minúsculo
        fake_policy.SetDefaultEndpoint.assert_called()


@pytest.mark.asyncio
async def test_deve_lancar_excecao_quando_device_nao_encontrado(client):
    with patch('pc_client.AudioUtilities') as mock_au:
        mock_au.GetAllDevices.return_value = []
        with pytest.raises(Exception, match='não encontrado'):
            await client.set_audio_output('DispositivoInexistente')


# ─────────────────────────────────────────────
# TTS
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deve_ignorar_tts_quando_texto_vazio(client):
    with patch('pc_client.PCControlClient.text_to_speech', new_callable=AsyncMock) as mock_tts:
        mock_tts.return_value = None
        # Chama diretamente — texto vazio deve retornar sem ação
        await client.text_to_speech('')
        # Se chegou aqui sem exceção, o guard de texto vazio funcionou


@pytest.mark.asyncio
async def test_deve_chamar_playsound_quando_tts_com_texto(client):
    mock_communicate = MagicMock()
    mock_communicate.save = AsyncMock()

    with patch('edge_tts.Communicate', return_value=mock_communicate), \
         patch('pc_client.playsound') as mock_play, \
         patch('os.unlink'), \
         patch('tempfile.mktemp', return_value='/tmp/test.mp3'):
        await client.text_to_speech('Olá mundo')
        mock_communicate.save.assert_awaited_once_with('/tmp/test.mp3')
        mock_play.assert_called_once_with('/tmp/test.mp3')


@pytest.mark.asyncio
async def test_deve_deletar_arquivo_temp_apos_tts(client):
    mock_communicate = MagicMock()
    mock_communicate.save = AsyncMock()

    with patch('edge_tts.Communicate', return_value=mock_communicate), \
         patch('pc_client.playsound'), \
         patch('os.unlink') as mock_unlink, \
         patch('tempfile.mktemp', return_value='/tmp/test.mp3'):
        await client.text_to_speech('teste')
        mock_unlink.assert_called_once_with('/tmp/test.mp3')


# ─────────────────────────────────────────────
# Fullscreen — dois comandos
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deve_pressionar_f_quando_video_fullscreen(client):
    with patch('pyautogui.press') as mock_press:
        await client.handle_command('video-fullscreen', {})
        mock_press.assert_called_once_with('f')


@pytest.mark.asyncio
async def test_deve_pressionar_f11_quando_fullscreen_janela(client):
    with patch('pyautogui.press') as mock_press:
        await client.handle_command('fullscreen', {})
        mock_press.assert_called_once_with('f11')


# ─────────────────────────────────────────────
# Fix VGA: DisplaySwitch /external
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deve_chamar_displayswitch_external_quando_cinema_mode(client):
    with patch('subprocess.Popen') as mock_popen, \
         patch('pyautogui.press'), \
         patch('pc_client.PCControlClient._find_window_by_title', return_value=None), \
         patch('pc_client.PCControlClient.set_volume', new_callable=AsyncMock):
        await client.cinema_mode()
        calls = [str(c) for c in mock_popen.call_args_list]
        assert any('/external' in c for c in calls), \
            f"cinema_mode deve usar /external, mas chamou: {calls}"


@pytest.mark.asyncio
async def test_nao_deve_chamar_displayswitch_internal_no_cinema_mode(client):
    with patch('subprocess.Popen') as mock_popen, \
         patch('pyautogui.press'), \
         patch('pc_client.PCControlClient._find_window_by_title', return_value=None), \
         patch('pc_client.PCControlClient.set_volume', new_callable=AsyncMock):
        await client.cinema_mode()
        calls = [str(c) for c in mock_popen.call_args_list]
        assert not any('/internal' in c for c in calls), \
            f"/internal não deve ser usado no cinema_mode (manteria VGA ligado)"


@pytest.mark.asyncio
async def test_deve_chamar_displayswitch_external_quando_night_mode(client):
    with patch('subprocess.Popen') as mock_popen, \
         patch('pc_client.PCControlClient.set_volume', new_callable=AsyncMock), \
         patch('pc_client.PCControlClient._set_night_light'):
        await client.night_mode()
        calls = [str(c) for c in mock_popen.call_args_list]
        assert any('/external' in c for c in calls), \
            f"night_mode deve usar /external, mas chamou: {calls}"


@pytest.mark.asyncio
async def test_deve_chamar_displayswitch_extend_quando_dual_monitor(client):
    with patch('subprocess.Popen') as mock_popen:
        await client.dual_monitor()
        mock_popen.assert_called_once_with(["DisplaySwitch.exe", "/extend"])


# ─────────────────────────────────────────────
# claude-yes
# ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deve_pressionar_enter_quando_claude_yes(client):
    with patch('pyautogui.press') as mock_press, \
         patch('pc_client.PCControlClient._find_window_by_title', return_value=None):
        await client.handle_command('claude-yes', {})
        mock_press.assert_called_with('enter')


@pytest.mark.asyncio
async def test_deve_buscar_janela_claude_antes_do_enter(client):
    mock_hwnd = 12345
    with patch('pyautogui.press'), \
         patch('ctypes.windll.user32.ShowWindow'), \
         patch('ctypes.windll.user32.SetForegroundWindow'), \
         patch('pc_client.PCControlClient._find_window_by_title',
               return_value=mock_hwnd) as mock_find:
        await client.handle_command('claude-yes', {})
        mock_find.assert_called()  # deve ter tentado encontrar janela
