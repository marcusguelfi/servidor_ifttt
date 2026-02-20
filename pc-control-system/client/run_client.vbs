Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "python """ & Replace(WScript.ScriptFullName, "run_client.vbs", "pc_client.py") & """", 0, False
