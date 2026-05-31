import pyautogui

from commands import register


@register('mouse-move')
async def mouse_move(client, params):
    pyautogui.moveRel(int(params.get('dx', 0)), int(params.get('dy', 0)), duration=0)


@register('mouse-click')
async def mouse_click(client, params):
    pyautogui.click(button=params.get('button', 'left'))


@register('mouse-scroll')
async def mouse_scroll(client, params):
    pyautogui.scroll(int(params.get('delta', 3)))


@register('press-key')
async def press_key(client, params):
    key = params.get('key', '')
    if key:
        pyautogui.press(key)
        print(f"Tecla pressionada: {key}")


@register('type-text')
async def type_text(client, params):
    text = params.get('text', '')
    if text:
        pyautogui.typewrite(text, interval=0.05)
        print(f"Texto digitado: {text}")
