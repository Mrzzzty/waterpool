"""Small client for the user's already running Blender addon on localhost."""
import socket,json,sys,argparse
p=argparse.ArgumentParser();p.add_argument('--file');p.add_argument('--code');p.add_argument('--timeout',type=float,default=120);a=p.parse_args()
code=a.code
if a.file:
 from pathlib import Path
 script=Path(a.file).resolve()
 source=script.read_text(encoding='utf-8-sig')
 # The addon executes a string, so supply the same file context as Blender --python.
 code=f"exec(compile({source!r}, {str(script)!r}, 'exec'), dict(globals(), __file__={str(script)!r}))"
with socket.create_connection(('127.0.0.1',9876),timeout=a.timeout) as s:
 s.settimeout(a.timeout);s.sendall(json.dumps({'type':'execute_code','params':{'code':code}}).encode())
 data=b''
 while True:
  chunk=s.recv(262144)
  if not chunk:raise RuntimeError('Blender addon disconnected before returning JSON')
  data+=chunk
  try:result=json.loads(data);break
  except json.JSONDecodeError:pass
 print(json.dumps(result,ensure_ascii=False))
 if result.get('status')!='success':sys.exit(1)

