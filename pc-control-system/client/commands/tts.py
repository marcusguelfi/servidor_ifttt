import os
import asyncio
import tempfile
import subprocess

from commands import register


@register('tts')
async def text_to_speech(client, params):
    text = params.get('text', '')
    if not text:
        print("Texto vazio para TTS")
        return
    print(f"TTS: {text}")
    try:
        import edge_tts
        from playsound import playsound
        voice = os.environ.get('TTS_VOICE', 'pt-BR-AntonioNeural')
        rate  = os.environ.get('TTS_RATE', '+0%')
        tts = edge_tts.Communicate(text, voice=voice, rate=rate)
        tmp = tempfile.mktemp(suffix='.mp3')
        await tts.save(tmp)
        await asyncio.to_thread(playsound, tmp)
        os.unlink(tmp)
        print("TTS concluido!")
    except Exception as e:
        import traceback; traceback.print_exc()
        print(f"Erro no TTS: {e}")


@register('notification')
async def show_notification(client, params):
    message = params.get('message', 'Notificacao')
    print(f"Notificacao: {message}")
    ps = f'''
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>PC Control</text><text>{message}</text></binding></visual></toast>')
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("PC Control").Show($toast)
    '''
    subprocess.run(["powershell", "-Command", ps], capture_output=True, timeout=10)
    print("Notificacao enviada!")
