import comtypes
from comtypes import CLSCTX_ALL, GUID, IUnknown, COMMETHOD
from ctypes import cast, POINTER, HRESULT, c_uint, c_void_p, c_int, c_wchar_p
from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
import pyautogui

from commands import register

# COM interfaces para troca de dispositivo de áudio padrão no Windows
_POLICY_CONFIG_METHODS = [
    COMMETHOD([], HRESULT, 'GetMixFormat',          (['in'], c_wchar_p), (['in'], c_void_p)),
    COMMETHOD([], HRESULT, 'GetDeviceFormat',       (['in'], c_wchar_p), (['in'], c_int), (['in'], c_void_p)),
    COMMETHOD([], HRESULT, 'ResetDeviceFormat',     (['in'], c_wchar_p)),
    COMMETHOD([], HRESULT, 'SetDeviceFormat',       (['in'], c_wchar_p), (['in'], c_void_p), (['in'], c_void_p)),
    COMMETHOD([], HRESULT, 'GetProcessingPeriod',   (['in'], c_wchar_p), (['in'], c_int), (['in'], c_void_p), (['in'], c_void_p)),
    COMMETHOD([], HRESULT, 'SetProcessingPeriod',   (['in'], c_wchar_p), (['in'], c_void_p)),
    COMMETHOD([], HRESULT, 'GetShareMode',          (['in'], c_wchar_p), (['in'], c_void_p)),
    COMMETHOD([], HRESULT, 'SetShareMode',          (['in'], c_wchar_p), (['in'], c_uint)),
    COMMETHOD([], HRESULT, 'GetPropertyValue',      (['in'], c_wchar_p), (['in'], c_int), (['in'], c_void_p), (['in'], c_void_p)),
    COMMETHOD([], HRESULT, 'SetPropertyValue',      (['in'], c_wchar_p), (['in'], c_int), (['in'], c_void_p), (['in'], c_void_p)),
    COMMETHOD([], HRESULT, 'SetDefaultEndpoint',    (['in'], c_wchar_p, 'wszDeviceId'), (['in'], c_uint, 'eRole')),
    COMMETHOD([], HRESULT, 'SetEndpointVisibility', (['in'], c_wchar_p), (['in'], c_int)),
]


class _IPolicyConfig(IUnknown):
    _iid_ = GUID('{f8679f50-850a-41cf-9c72-430f290290c8}')  # Win7/8
    _methods_ = _POLICY_CONFIG_METHODS


class _IPolicyConfigVista(IUnknown):
    _iid_ = GUID('{568b9108-44bf-40b4-9006-86afe5b5a620}')  # Win10/11
    _methods_ = _POLICY_CONFIG_METHODS


_CLSID_PolicyConfigClient = GUID('{870af99c-171d-4f9e-af0d-e63df40c2bc9}')


def _get_volume_control():
    speakers = AudioUtilities.GetSpeakers()
    mmdevice = getattr(speakers, '_dev', speakers)
    interface = mmdevice.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
    return cast(interface, POINTER(IAudioEndpointVolume))


@register('set-volume')
async def set_volume(client, params):
    volume = params.get('volume', 50)
    vc = _get_volume_control()
    vc.SetMasterVolumeLevelScalar(max(0, min(100, int(volume))) / 100.0, None)
    print(f"Volume ajustado para {volume}%")


@register('mute')
async def toggle_mute(client, params):
    vc = _get_volume_control()
    current = vc.GetMute()
    vc.SetMute(not current, None)
    print(f"Audio {'mutado' if not current else 'desmutado'}!")


@register('set-audio-device')
async def set_audio_device(client, params):
    device_name = params.get('device')
    if not device_name:
        raise ValueError("Parametro 'device' obrigatorio")
    print(f"Tentando mudar para: {device_name}")
    target_id = None
    for dev in AudioUtilities.GetAllDevices(data_flow=0, device_state=1):
        if dev.FriendlyName and device_name.lower() in dev.FriendlyName.lower():
            target_id = dev.id
            print(f"  Device encontrado: {dev.FriendlyName}")
            break
    if not target_id:
        raise Exception(f"Dispositivo nao encontrado: {device_name}")
    last_err = None
    for iface in [_IPolicyConfig, _IPolicyConfigVista]:
        try:
            policy = comtypes.CoCreateInstance(_CLSID_PolicyConfigClient, iface, comtypes.CLSCTX_ALL)
            for role in range(3):
                policy.SetDefaultEndpoint(target_id, role)
            print(f"Saida de audio alterada para: {device_name}")
            return
        except Exception as e:
            last_err = e
    raise Exception(f"IPolicyConfig falhou: {last_err}")


@register('media-play-pause')
async def media_play_pause(client, params):
    pyautogui.press('playpause')
    print("Media play/pause!")


@register('media-next')
async def media_next(client, params):
    pyautogui.press('nexttrack')
    print("Media next!")


@register('media-prev')
async def media_prev(client, params):
    pyautogui.press('prevtrack')
    print("Media prev!")
