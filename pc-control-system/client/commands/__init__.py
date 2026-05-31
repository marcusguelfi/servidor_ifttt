"""
Command registry for PC Control client.
Each module in this package registers its commands when imported.
To add a new command: create a new .py file and use the @register('name') decorator.
"""
import importlib

COMMANDS: dict = {}


def register(name: str):
    def decorator(fn):
        COMMANDS[name] = fn
        return fn
    return decorator


def load_all():
    """Auto-import all command modules so they self-register."""
    for mod in ('system', 'audio', 'display', 'input_', 'apps', 'tts', 'gaming'):
        importlib.import_module(f'commands.{mod}')
