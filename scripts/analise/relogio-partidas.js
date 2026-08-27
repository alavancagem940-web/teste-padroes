"use strict";
/* Relógio das partidas: fuso Europe/London e ciclos de 3 minutos.
 * A âncora confirmada pelo usuário é 02:57; os horários seguintes são +3 min.
 * O slot muda somente quando o relógio chega ao horário da partida.
 * A janela de 1min15 antes da próxima partida é exclusiva do registro
 * do resultado da partida encerrada; ela não controla as previsões.
 */
const RelogioPartidas = {
  TIME_ZONE: 'Europe/London',
  ANCHOR_MINUTES: 2 * 60 + 57,
  JANELA_REGISTRO_RESULTADO_SEGUNDOS: 75,
  _timer: null,
  _listeners: new Set(),
  _fmtDate(d=new Date()) {
    return new Intl.DateTimeFormat('en-CA',{timeZone:this.TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  },
  _parts(d=new Date()) {
    const p=new Intl.DateTimeFormat('en-GB',{timeZone:this.TIME_ZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d);
    const o={}; for(const x of p) o[x.type]=x.value; return {hour:Number(o.hour),minute:Number(o.minute),second:Number(o.second)};
  },
  agora(d=new Date()) { const p=this._parts(d); return {...p,data:this._fmtDate(d),timeZone:this.TIME_ZONE}; },
  _slotMinute(minute) {
    let delta=(minute-this.ANCHOR_MINUTES)%3; if(delta<0)delta+=3;
    return minute-delta;
  },
  _shiftDate(data, days) {
    if (!days) return data;
    const [y,m,day]=String(data).split('-').map(Number);
    const d=new Date(Date.UTC(y,m-1,day));
    d.setUTCDate(d.getUTCDate()+days);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  },
  _slot(a, extra=0) {
    let m=this._slotMinute(a.minute)+extra, h=a.hour, dayShift=0;
    while(m>=60){m-=60;h++;}
    while(m<0){m+=60;h--;}
    while(h>=24){h-=24;dayShift++;}
    while(h<0){h+=24;dayShift--;}
    return {data:this._shiftDate(a.data,dayShift),horario:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,hora:h,minuto:m,segundo:a.second,timeZone:this.TIME_ZONE};
  },
  _addMinutes(slot,n){
    let total=slot.hora*60+slot.minuto+n, dayShift=0;
    while(total>=1440){total-=1440;dayShift++;}
    while(total<0){total+=1440;dayShift--;}
    const h=Math.floor(total/60), m=total%60;
    return {data:this._shiftDate(slot.data,dayShift),horario:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,hora:h,minuto:m,timeZone:this.TIME_ZONE};
  },
  partidaAtual(d=new Date()) {
    // O slot só muda quando o relógio realmente chega ao início da próxima partida.
    // Os últimos 75 segundos do slot anterior são apenas a janela para liberar o registro do resultado.
    const a=this.agora(d);
    return this._slot(a,0);
  },
  partidaAnterior(d=new Date()) { const atual=this.partidaAtual(d); return this._addMinutes(atual,-3); },
  proximaPartida(d=new Date()) { const atual=this.partidaAtual(d); return this._addMinutes(atual,3); },
  partidaParaRegistrarResultado(d=new Date()) { return this.partidaAtual(d); },
  segundosAteProximaPartida(d=new Date()) {
    const a=this.agora(d);
    const offset=((a.minute-this.ANCHOR_MINUTES)%3+3)%3;
    const minutosRestantes=3-offset;
    return minutosRestantes*60-a.second;
  },
  janelaRegistroResultadoAberta(d=new Date()) {
    const restante=this.segundosAteProximaPartida(d);
    return restante > 0 && restante <= this.JANELA_REGISTRO_RESULTADO_SEGUNDOS;
  },
  horarioLiberacaoRegistro(d=new Date()) {
    const n=this.proximaPartida(d);
    let total=((n.hora*60+n.minuto)*60)-this.JANELA_REGISTRO_RESULTADO_SEGUNDOS;
    let data=n.data;
    while(total<0){total+=86400;data=this._shiftDate(data,-1);}
    while(total>=86400){total-=86400;data=this._shiftDate(data,1);}
    const h=Math.floor(total/3600);
    const m=Math.floor((total%3600)/60);
    const sec=total%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  },
  slotPorHorario(horario, data=null) {
    if(!/^\d{2}:\d{2}$/.test(String(horario||''))) return null;
    const [h,m]=String(horario).split(':').map(Number);
    if(h>23 || m>59) return null;
    const baseData = data || this.agora().data;
    const esperado=this._slotMinute(m);
    if(esperado!==m) return null;
    return {data:baseData,horario:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,hora:h,minuto:m,timeZone:this.TIME_ZONE};
  },
  chave(slot){return `${slot.data}|${slot.horario}`;},
  iniciar(){
    if(this._timer)return;
    const tick=()=>{
      for(const fn of this._listeners){try{fn(this.agora(),this.partidaAtual(),this.proximaPartida());}catch(e){console.error(e)}}
    };
    tick(); this._timer=setInterval(tick,1000);
  },
  observar(fn){if(typeof fn==='function')this._listeners.add(fn); return ()=>this._listeners.delete(fn);}
};
