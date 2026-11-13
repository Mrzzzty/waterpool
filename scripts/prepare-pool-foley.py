"""Cut CC0 location recordings into bounded, reusable single-step cues.
Sources: Joseph SARDIN / BigSoundBank, 0179 and 0690. Originals stay in .work-backup/audio.
"""
from pathlib import Path
import json, hashlib, warnings
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt, find_peaks, resample_poly
from math import gcd

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'src/assets/audio'; OUT.mkdir(parents=True,exist_ok=True)
RATE=32000
PAGES={'0179':'https://bigsoundbank.com/steps-slipper-on-tiling-s0179.html',
       '0690':'https://bigsoundbank.com/shoes-in-the-water-s0690.html'}
packed=[]; cues={}; offset=0; sources=[]
for name,number,duration,separation in [('dry','0179',.34,.65),('wet','0690',.55,.40)]:
    path=ROOT/'.work-backup/audio'/f'{number}.wav'
    with warnings.catch_warnings():
        warnings.simplefilter('ignore'); rate,data=wavfile.read(path)
    audio=data.astype(np.float64)/np.iinfo(data.dtype).max
    if audio.ndim>1: audio=audio.mean(axis=1)
    audio=sosfiltfilt(butter(2,65,fs=rate,btype='highpass',output='sos'),audio)
    divisor=gcd(rate,RATE);audio=resample_poly(audio,RATE//divisor,rate//divisor)
    window=int(.012*RATE)
    rms=np.sqrt(np.convolve(audio*audio,np.ones(window)/window,mode='same'))
    peaks,_=find_peaks(rms,distance=int(separation*RATE),prominence=rms.max()*.10,height=rms.max()*.16)
    peaks=peaks[(peaks>RATE*.25)&(peaks<len(audio)-RATE*duration)]
    if len(peaks)<4:raise RuntimeError(f'Not enough isolated {name} steps: {len(peaks)}')
    # Use eight isolated steps, avoiding the weakest background transients.
    peaks=np.sort(sorted(peaks,key=lambda p:rms[p],reverse=True)[:8])
    cues[name]=[]
    for peak in peaks:
        start=max(0,peak-int(.055*RATE));clip=audio[start:start+int(duration*RATE)].copy()
        fade=int(.018*RATE);clip[:int(.003*RATE)]*=np.linspace(0,1,int(.003*RATE))
        clip[-fade:]*=np.linspace(1,0,fade)
        clip*=min(4.,.65/max(.0001,np.abs(clip).max()))
        cues[name].append({'offset':offset/RATE,'duration':len(clip)/RATE,'sourceTime':round(start/RATE,3)})
        silence=np.zeros(int(.04*RATE));packed.extend([clip,silence]);offset+=len(clip)+len(silence)
    sources.append({'id':number,'author':'Joseph SARDIN / BigSoundBank','license':'CC0-1.0','page':PAGES[number],
                    'original':f'https://bigsoundbank.com/UPLOAD/bwf-en/{number}.wav',
                    'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
joined=np.concatenate(packed)
wavfile.write(OUT/'pool-foley.wav',RATE,np.rint(np.clip(joined,-1,1)*32767).astype(np.int16))
(OUT/'pool-foley.json').write_text(json.dumps(cues,indent=2),encoding='utf-8')
(OUT/'sources.json').write_text(json.dumps({'sources':sources,'processing':'mono 32 kHz, 65 Hz high-pass, isolated steps, short fades, peak <= 0.65'},indent=2),encoding='utf-8')
print(json.dumps({'cues':{k:len(v) for k,v in cues.items()},'seconds':len(joined)/RATE,'peak':float(np.max(np.abs(joined))),'bytes':(OUT/'pool-foley.wav').stat().st_size}))
