export type Credentials = { apiUrl: string; idInstance: string; apiTokenInstance: string };
export type Message = { id: string; chatId: string; text: string; direction: 'in'|'out'; timestamp: number };
export type Notification = { receiptId: number; body: {typeWebhook?: string; idMessage?: string; timestamp?: number; senderData?: {chatId?: string; senderPhoneNumber?: number|string; chatName?: string; senderName?: string}; messageData?: {typeMessage?: string; textMessageData?: {textMessage?: string}; extendedTextMessageData?: {text?: string}}} };
export function validateCredentials(c: Credentials) {
  const url = new URL(c.apiUrl);
  if(url.protocol !== 'https:' || !/^(\d+\.api\.green-api\.com|api\.green-api\.com)$/.test(url.hostname) || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname)) throw new Error('Укажите HTTPS apiUrl из кабинета GREEN-API (например https://3100.api.green-api.com).');
  if(!/^\d+$/.test(c.idInstance)) throw new Error('idInstance должен содержать только цифры.');
  if(!/^[A-Za-z0-9_-]+$/.test(c.apiTokenInstance)) throw new Error('Проверьте apiTokenInstance.');
}
export function phoneToChatId(phone: string) {
  const digits=phone.replace(/[+\s()-]/g,'');
  if(!/^\d{7,15}$/.test(digits)) throw new Error('Введите телефон с кодом страны: от 7 до 15 цифр.');
  return `${digits}@c.us`;
}
export function parseNotification(n: Notification): Message|null {
  const b=n.body;
  if(b.typeWebhook !== 'incomingMessageReceived' || !b.idMessage || !b.senderData?.chatId) return null;
  const text=b.messageData?.textMessageData?.textMessage ?? b.messageData?.extendedTextMessageData?.text;
  if(typeof text !== 'string') return null;
  // MAX may return an internal chat ID instead of the phone used to open a chat.
  const phone=b.senderData.senderPhoneNumber;
  const chatId=phone ? `${String(phone).replace(/\D/g,'')}@c.us` : b.senderData.chatId;
  return {id:b.idMessage,chatId,text,direction:'in',timestamp:(b.timestamp ?? Math.floor(Date.now()/1000))*1000};
}
export class GreenApi {
  constructor(private credentials: Credentials) { validateCredentials(credentials); }
  private async request<T>(method: string, httpMethod: string, signal?: AbortSignal, body?: unknown, suffix=''):Promise<T> {
    const c=this.credentials;
    const url=`${c.apiUrl.replace(/\/$/,'')}/waInstance${c.idInstance}/${method}/${encodeURIComponent(c.apiTokenInstance)}${suffix}`;
    const timeout = AbortSignal.timeout(45000);
    let response:Response;
    try {response=await fetch(url,{method:httpMethod,signal:signal?AbortSignal.any([signal,timeout]):timeout,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});}
    catch(e) {if(signal?.aborted) throw e;throw new Error('Не удалось связаться с GREEN-API. Проверьте сеть, apiUrl и доступность сервиса.');}
    if(!response.ok) {
      const explanation:Record<number,string>={400:'Проверьте номер, настройки инстанса и текст сообщения.',401:'Неверные учётные данные.',403:'Нет доступа: проверьте тариф и авторизацию инстанса.',429:'Слишком много запросов. Повторите позже.'};
      throw new Error(`GREEN-API: ${response.status}. ${explanation[response.status] ?? 'Временная ошибка сервиса.'}`);
    }
    const text=await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }
  state(signal?:AbortSignal){return this.request<{stateInstance:string}>('getStateInstance','GET',signal);}
  send(chatId:string,message:string,signal?:AbortSignal){return this.request<{idMessage:string}>('sendMessage','POST',signal,{chatId,message});}
  receive(signal:AbortSignal){return this.request<Notification|null>('receiveNotification','GET',signal,undefined,'?receiveTimeout=5');}
  acknowledge(receiptId:number,signal:AbortSignal){return this.request<{result:boolean}>('deleteNotification','DELETE',signal,undefined,`/${receiptId}`);}
}
export function startPolling(api:Pick<GreenApi,'receive'|'acknowledge'>,onMessage:(m:Message)=>void,onStatus:(error:string|null)=>void) {
  const controller=new AbortController();
  const seen=new Set<string>();
  let timer:ReturnType<typeof setTimeout>|undefined;
  let wake: (()=>void)|undefined;
  const pause=(ms:number)=>new Promise<void>(resolve=>{wake=resolve;timer=setTimeout(resolve,ms);});
  void (async()=>{
    let failures=0;
    while(!controller.signal.aborted) {
      try {
        const n=await api.receive(controller.signal);
        if(controller.signal.aborted) break;
        if(n) {
          const message=parseNotification(n);
          if(message && !seen.has(`${message.chatId}:${message.id}`)) {onMessage(message);seen.add(`${message.chatId}:${message.id}`);}
          await api.acknowledge(n.receiptId,controller.signal);
        }
        failures=0;onStatus(null);await pause(n?1100:500);
      } catch(e) {
        if(controller.signal.aborted) break;
        onStatus(e instanceof Error?e.message:'Ошибка получения сообщений.');
        await pause(Math.min(30000,2000*2**failures++));
      }
    }
  })();
  return ()=>{controller.abort();if(timer)clearTimeout(timer);wake?.();};
}
