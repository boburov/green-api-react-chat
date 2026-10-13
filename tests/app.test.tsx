import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {App} from '../src/App';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('connects, opens a recipient, sends text, receives replies and clears credentials on logout',async()=>{
 Element.prototype.scrollIntoView=vi.fn();
 let reply=false;
 const fetcher=vi.fn(async(input:RequestInfo|URL,options?:RequestInit)=>{
  const url=String(input);
  if(url.includes('getStateInstance'))return new Response('{"stateInstance":"authorized"}');
  if(url.includes('sendMessage')){expect(JSON.parse(options?.body as string)).toEqual({chatId:'998901234567@c.us',message:'Привет'});reply=true;return new Response('{"idMessage":"sent1"}');}
  if(url.includes('deleteNotification'))return new Response('{"result":true}');
  if(reply){reply=false;return new Response(JSON.stringify({receiptId:1,body:{typeWebhook:'incomingMessageReceived',idMessage:'reply1',senderData:{chatId:'998901234567@c.us'},messageData:{textMessageData:{textMessage:'Здравствуйте!'}}}}));}
  return new Response('null');
 });vi.stubGlobal('fetch',fetcher);
 render(<App/>);
 fireEvent.change(screen.getByLabelText('apiUrl'),{target:{value:'https://3100.api.green-api.com'}});
 fireEvent.change(screen.getByLabelText('idInstance'),{target:{value:'3100000000'}});
 fireEvent.change(screen.getByLabelText('apiTokenInstance'),{target:{value:'fake-test-token'}});
 fireEvent.click(screen.getByRole('button',{name:'Подключить чат →'}));
 await screen.findByText('Сообщения');
 fireEvent.change(screen.getByLabelText('Новый чат'),{target:{value:'+998901234567'}});
 fireEvent.click(screen.getByRole('button',{name:'Создать чат'}));
 fireEvent.change(screen.getByLabelText('Сообщение'),{target:{value:'Привет'}});
 fireEvent.click(screen.getByRole('button',{name:'Отправить сообщение'}));
 await screen.findByText('Привет',{selector:'.bubble p'});
 await screen.findByText('Здравствуйте!',{selector:'.bubble p'}, {timeout:4000});
 fireEvent.click(screen.getByRole('button',{name:'Выйти'}));
 await screen.findByRole('button',{name:'Подключить чат →'});
 expect((screen.getByLabelText('apiTokenInstance') as HTMLInputElement).value).toBe('');
 expect(screen.queryByText('Здравствуйте!')).toBeNull();
});
it('keeps unsent text after a rejected API send',async()=>{
 Element.prototype.scrollIntoView=vi.fn();
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>new Response(String(input).includes('getStateInstance')?'{"stateInstance":"authorized"}':String(input).includes('sendMessage')?'denied':'null',{status:String(input).includes('sendMessage')?403:200})));
 render(<App/>);
 for(const [label,value] of [['apiUrl','https://3100.api.green-api.com'],['idInstance','3100000000'],['apiTokenInstance','fake-token']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 fireEvent.click(screen.getByRole('button',{name:'Подключить чат →'}));await screen.findByText('Сообщения');
 fireEvent.change(screen.getByLabelText('Новый чат'),{target:{value:'998901234567'}});fireEvent.click(screen.getByRole('button',{name:'Создать чат'}));
 fireEvent.change(screen.getByLabelText('Сообщение'),{target:{value:'Не потерять'}});fireEvent.click(screen.getByRole('button',{name:'Отправить сообщение'}));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('403'));
 expect((screen.getByLabelText('Сообщение') as HTMLTextAreaElement).value).toBe('Не потерять');
 expect(screen.queryByText('Не потерять',{selector:'.bubble p'})).toBeNull();
});
