# RoomGroove per Echo Show

Una stanza con due WiZ e una striscia Hue, da disporre e ascoltare nel browser. La pagina mostra un’anteprima delle luci. Il microfono, se il browser lo consente, misura la musica intorno al dispositivo. I comandi per le lampade fisiche del progetto desktop usano WiZ su UDP e Hue Entertainment su DTLS, trasporti che questa web app non può aprire.

[Apri RoomGroove](https://andreaborio.github.io/roomgroove-show/)

## Sullo Show

Apri l’indirizzo in Amazon Silk e aggiungilo ai preferiti. Per provare l’audio, scegli il microfono e autorizza la richiesta sul display. Se l’indicatore segue una cassa esterna, la pagina sta ricevendo il microfono. Il ritmo di prova è disponibile anche quando Silk rifiuta l’accesso. La compatibilità con il microfono dipende dal modello e dal software del dispositivo.

Tocca una luce per aprirne la scheda. In **Modifica stanza** puoi trascinare il simbolo, scegliere un punto o usare le frecce. **Salva** conserva le posizioni nel browser del dispositivo. I tre nomi e la disposizione iniziale sono dimostrativi. Aprire la pagina da un altro dispositivo crea una stanza separata.

## Funzionamento

HTML, CSS e JavaScript statici. L’audio viene elaborato localmente con Web Audio e non viene registrato né trasmesso. Su un browser che supporta i service worker, la pagina già visitata può riaprirsi offline. Il manifesto supporta l’avvio indipendente nei browser che offrono questa funzione.

Per lo sviluppo si può servire la cartella su localhost. Sul dispositivo fisico si usa HTTPS. Per verificare la risposta audio, riprodurre musica da una sorgente esterna, osservare il livello, interrompere il microfono e controllare che l’indicatore si spenga.
