'use strict';

var MaxNumberOfUsers = 6;			// Number of max users per room
var numClients; 					// Number of users currently in the room
var myId;							// User's Id

/* Get parameters from url */
var params = getQueryParams(document.location.search) 
var room = params.room;				// Room name
var username = params.username;		// User name

/* Peer Connection Variables */
var isChannelReady = new Array(MaxNumberOfUsers);
var pc = new Array(MaxNumberOfUsers);
var isStarted = new Array(MaxNumberOfUsers);
var isInitiator;					// Defines if this user have to initiate the connection

/* DataChannel */
var sendChannel = new Array(MaxNumberOfUsers);

/* Sets HTML Divs. Example: User with id 3 will always be shown in the div #remoteVideo3 */
var remoteVideo = new Array(MaxNumberOfUsers);
for (var i = 0; i < MaxNumberOfUsers; i++)
    remoteVideo[i] = document.querySelector('#remoteVideo'+i);

var localVideo;  					// Stores div which local video will be displayed.
var localStream;					// Stores LocalStream
var turnReady;

// Configuration des serveurs stun...
var pc_config = webrtcDetectedBrowser === 'firefox' ?
  {'iceServers':[{'url':'stun:23.21.150.121'}]} : // number IP
  {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};

// Peer connection constraints
var pc_constraints = {
  'optional': [
    {'DtlsSrtpKeyAgreement': true},
    {'RtpDataChannels': true}
  ]};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {'mandatory': {
  'OfferToReceiveAudio':true,
  'OfferToReceiveVideo':true }};

var socket = io.connect();

/* Get parameters from url */
function getQueryParams(qs) {
    qs = qs.split("+").join(" ");
    var params = {}, tokens, re = /[?&]?([^=]+)=([^&]*)/g;
    while (tokens = re.exec(qs))
        params[decodeURIComponent(tokens[1])] = decodeURIComponent(tokens[2]);
    return params;
}

if (room !== '') {
  console.log('Create or join room', room);
  socket.emit('create or join', room);
}

/* If room already has 6 people */
socket.on('full', function (room){
	console.log('Room ' + room + ' is full');
});

/* Server send this message to everyone when someone join the room */
socket.on('join', function (room, idClientEntered){
	console.log('Another peer made a request to join room ' + room);
	isChannelReady[idClientEntered] = true;
	numClients = idClientEntered+1;
});

/* Server send this message to the client who just joined the room */
socket.on('joined', function (room, idClientEntered){
	console.log(Date()+'This peer has joined room ' + room);
	for (var i=0; i <= idClientEntered; i++)
		isChannelReady[i] = true;
	numClients = idClientEntered+1;
	myId = idClientEntered;
	localVideo = document.querySelector('#remoteVideo'+myId);
});

/* Log */
socket.on('log', function (array){
	console.log.apply(console, array);
});

/* Send Message to everyone in this room */
function sendMessage(message){
	// Push room to the message array, the server knows the last element of the array meessage is the room
	message.push(room);
	console.log(Date()+'Sending message: ', message);
	socket.emit('message', message);
}

/* Receive a message sent by the server
	message is an array with: [message content, id of the user who sent the message, (optional) user who is the message recipient, room name] 
*/
socket.on('message', function (message){
	console.log(Date()+'Received message:', message);

	var valueMessage = message[0];		// The message itself, the content of the message
	var fromId = message[1];			// User who send the message
	if (message.length == 3)
		var toId = -1;					// The message is not for a specific user, it's for everyone
	else
		var toId = message[2];			// Recipient of the message

	if (valueMessage === 'got user media') {
		// Tries to open the peer connection
		maybeStart(fromId);
	} else if (valueMessage.type === 'offer' && toId == myId) {
		console.log(Date()+" Received offer");
		isInitiator=isInit(myId,fromId);
		if (!isInitiator && !isStarted[fromId])
			// Offer received, tries to open the connection
			maybeStart(fromId);
		// Initializes the peer connection with the remote description sent by the other peer
		pc[fromId].setRemoteDescription(new RTCSessionDescription(valueMessage));
		// Sends an answer to the offer
		doAnswer(fromId);
	} else if (valueMessage.type === 'answer' && isStarted[fromId] && toId == myId) {
		console.log(Date()+' Received answer');
		// Answer received, so initializes the peer connection with the remote description sent by the other peer
		pc[fromId].setRemoteDescription(new RTCSessionDescription(valueMessage));
	} else if (valueMessage.type === 'candidate' && isStarted[fromId]) {
		// Adds candidature to the peer connection
		var candidate = new RTCIceCandidate({sdpMLineIndex:valueMessage.label, candidate:valueMessage.candidate});
		pc[fromId].addIceCandidate(candidate);
	} else if (valueMessage === 'bye' && isStarted[fromId]) {
		handleRemoteHangup(fromId);
	}
});

function handleUserMedia(stream) {
	localStream = stream;
	attachMediaStream(localVideo, stream);
	console.log(Date()+'Adding local stream.');

	// Send got user media to everyone
	var data = ['got user media', myId];
	sendMessage(data);

	// If we are the initiator we try to open the connection
	if (isInitiator && numClients > 1)
		maybeStart();
}

function handleUserMediaError(error){
	console.log(Date()+'getUserMedia error: ', error);
}

var constraints = {video: true};		// We tried to change this to do screen sharing but didn't worked

getUserMedia(constraints, handleUserMedia, handleUserMediaError);
console.log(Date()+'Getting user media with constraints', constraints);

// On regarde si on a besoin d'un serveur TURN que si on est pas en localhost
if (location.hostname != "localhost") {
	requestTurn('https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913');
}

/* If the connection is not started, the local stream is ready and the other peer is at the same room, we create the connection */
/* Furthermore, if we are the initiator, we call the function to sends an offer */
function maybeStart(OtherPeerId) {
	console.log(Date()+" entered in maybestart");
	if (!isStarted[OtherPeerId] && localStream && isChannelReady[OtherPeerId]) {
		// Create peer to peer connection
		createPeerConnection(OtherPeerId);

		pc[OtherPeerId].addStream(localStream);
		isStarted[OtherPeerId] = true;
		isInitiator = isInit(myId,OtherPeerId); 	// Someone has to initiate the connection, we define the initiator as the user with the lower id.
		if (isInitiator) {
			doCall(OtherPeerId);
		}
	}
}

window.onbeforeunload = function(e){
	sendMessage('bye', myId);
}

function createPeerConnection(OtherPeerId) {
	try {
		// Open peer connection between us and the peer with id OtherPeerId
		pc[OtherPeerId] = new RTCPeerConnection(pc_config, pc_constraints);

		pc[OtherPeerId].onicecandidate = handleIceCandidate;

		console.log(Date()+'Created RTCPeerConnnection with:\n' +
		  '  config: \'' + JSON.stringify(pc_config) + '\';\n' +
		  '  constraints: \'' + JSON.stringify(pc_constraints) + '\'.');
	} catch (e) {
		console.log(Date()+'Failed to create PeerConnection, exception: ' + e.message);
		alert('Cannot create RTCPeerConnection object.');
			return;
	}
	
	// Called to add remote stream
	pc[OtherPeerId].onaddstream = 	function handleRemoteStreamAdded(event) {
										  console.log(Date()+'Remote stream added.');
										  attachMediaStream(remoteVideo[OtherPeerId], event.stream);
									};

	// Called to remove stream
	pc[OtherPeerId].onremovestream = handleRemoteStreamRemoved;

	// If we are initiator we open a datachannel in the p2p connection
	isInitiator=isInit(myId,OtherPeerId);
	if (isInitiator) {
		try {
			sendChannel[OtherPeerId] = pc[OtherPeerId].createDataChannel("sendDataChannel",{reliable: false});
			sendChannel[OtherPeerId].onmessage = handleMessage;
			trace('Created send data channel');
		} catch (e) {
			alert('Failed to create data channel. ' + 'You need Chrome M25 or later with RtpDataChannel enabled');
			trace('createDataChannel() failed with exception: ' + e.message);
		}

		// Called when the data channel is open
		sendChannel[OtherPeerId].onopen = 	function handleSendChannelStateChange() {
												var readyState = sendChannel[OtherPeerId].readyState;
												trace('Send channel state is: ' + readyState);
											};
		// Called when the data channel is closed
		sendChannel[OtherPeerId].onclose = 	function handleSendChannelStateChange() {
												var readyState = sendChannel[OtherPeerId].readyState;
												trace('Send channel state is: ' + readyState);
											};
	} else {
    // if we are not initiator, called when other peer saves datachannel in peerconnection
		pc[OtherPeerId].ondatachannel =	function gotReceiveChannel(event) {
											trace('Receive Channel Callback');
											sendChannel[OtherPeerId] = event.channel;
											sendChannel[OtherPeerId].onmessage = handleMessage;
											sendChannel[OtherPeerId].onopen =  function handleReceiveChannelStateChange() {
															var readyState = sendChannel[OtherPeerId].readyState;
															trace('Receive channel state is: ' + readyState);
															//enableMessageInterface(readyState == "open");
														  };
											sendChannel[OtherPeerId].onclose = function handleReceiveChannelStateChange() {
															var readyState = sendChannel[OtherPeerId].readyState;
															trace('Receive channel state is: ' + readyState);
															//enableMessageInterface(readyState == "open");
														  };
										};
	}
}

/* Receives a candidature and send this to everyone */
function handleIceCandidate(event) {
	console.log(Date()+'handleIceCandidate event: ', event);
	if (event.candidate) {
		var data = [{
			type: 'candidate',
			label: event.candidate.sdpMLineIndex,
			id: event.candidate.sdpMid,
			candidate: event.candidate.candidate}, myId];
		sendMessage(data);
	} else {
		console.log(Date()+'End of candidates.');
	}
}

/* The peer initiator sends an offer to the the peer with id OtherPeerId */
function doCall(OtherPeerId) {
	var constraints = {'optional': [], 'mandatory': {'MozDontOfferDataChannel': true}};
	if (webrtcDetectedBrowser === 'chrome')
		for (var prop in constraints.mandatory)
			if (prop.indexOf('Moz') !== -1)
				delete constraints.mandatory[prop];
   
	constraints = mergeConstraints(constraints, sdpConstraints);
	console.log(Date()+'Sending offer to peer, with constraints: \n' +
    '  \'' + JSON.stringify(constraints) + '\'.');
 
	pc[OtherPeerId].createOffer(function setLocalAndSendMessage(sessionDescription) {
									sessionDescription.sdp = preferOpus(sessionDescription.sdp);
									pc[OtherPeerId].setLocalDescription(sessionDescription);
									var data = [sessionDescription, myId, OtherPeerId];
									sendMessage(data);
								}, 
								null, 
								constraints);
}

/* Sends an answer to the offer */
function doAnswer(OtherPeerId) {
	console.log(Date()+'Sending answer to peer.');

	pc[OtherPeerId].createAnswer(function setLocalAndSendMessage(sessionDescription) {        
								sessionDescription.sdp = preferOpus(sessionDescription.sdp);
								pc[OtherPeerId].setLocalDescription(sessionDescription);
								var data = [sessionDescription, myId, OtherPeerId];
								sendMessage(data);
							}, 
							null, 
							sdpConstraints);
}

function mergeConstraints(cons1, cons2) {
	var merged = cons1;
	for (var name in cons2.mandatory) {
		merged.mandatory[name] = cons2.mandatory[name];
	}
	merged.optional.concat(cons2.optional);
	return merged;
}

function requestTurn(turn_url) {
  var turnExists = false;
  for (var i in pc_config.iceServers) {
    if (pc_config.iceServers[i].url.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log(Date()+'Getting TURN server from ', turn_url);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function(){
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log(Date()+'Got TURN server: ', turnServer);
        pc_config.iceServers.push({
          'url': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turn_url, true);
    xhr.send();
  }
}

// Ecouteur de onremotestream : permet de voir la vidéo du pair distant dans 
// l'élément HTML remoteVideo
function handleRemoteStreamRemoved(event) {
	console.log(Date()+'Remote stream removed. Event: ', event);
}

function hangup() {
	console.log(Date()+'Hanging up.');
	stopAll();
	sendMessage('bye', myId); // Tells everyone we are leaving the room 
}

/* Someone has left the room */ 
function handleRemoteHangup(OtherPeerId) {
	console.log(Date()+'Session terminated.');
	stop(OtherPeerId);
	remoteVideo[OtherPeerId].hide;
	isInitiator = false;
}

/* If anyone has left the room, we close the peer connection with him */
function stop(OtherPeerId) {
	isStarted[OtherPeerId] = false;
	pc[OtherPeerId].close();
	pc[OtherPeerId] = null;
}

// Useless, ignore
function stopAll(){
    for (var i=0; i < isStarted.length; i++){
        isStarted[i] = false;
        pc[i].close();
        pc[i] = null;
    }
}

///////////////////////////////////////////
// M.Buffa : tambouille pour bidouiller la configuration sdp
// pour faire passer le codec OPUS en premier....
// 
// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
  var sdpLines = sdp.split('\r\n');
  var mLineIndex;
  // Search for m line.
  for (var i = 0; i < sdpLines.length; i++) {
      if (sdpLines[i].search('m=audio') !== -1) {
        mLineIndex = i;
        break;
      }
  }
  if (mLineIndex === null) {
    return sdp;
  }

  // If Opus is available, set it as the default in m line.
  for (i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('opus/48000') !== -1) {
      var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
      if (opusPayload) {
        sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
      }
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

function extractSdp(sdpLine, pattern) {
  var result = sdpLine.match(pattern);
  return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
  var elements = mLine.split(' ');
  var newLine = [];
  var index = 0;
  for (var i = 0; i < elements.length; i++) {
    if (index === 3) { // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    }
    if (elements[i] !== payload) {
      newLine[index++] = elements[i];
    }
  }
  return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {
  var mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (var i = sdpLines.length-1; i >= 0; i--) {
    var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      var cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}

/* Defines if we are the peer who have to initiate the connection, our convention is that the peer with the lower id will be always the initiator */
function isInit(myId,peerId) {
  if (myId < peerId)
    return true;
  else
    return false;
}

/*******************************
P2P File Sharing functions 
*******************************/

/* Send file */
function sendFile(filestosend, idOtherPeer){
	var file = filestosend[0];
	var reader = new window.FileReader();
	reader.readAsDataURL(file);
	reader.onload = function onReadAsDataURL(event, text) {
						var data = {}; // data object to transmit over data channel
						var chunkLength = 1000;
						
						if (event) text = event.target.result; // on first invocation

						if (text.length > chunkLength) {
						  data.message = text.slice(0, chunkLength); // getting chunk using predefined chunk length
						} else {
						  data.message = text;
						  data.last = true;
						}
						
						console.log('sending file chunk', room);
						sendChannel[idOtherPeer].send(JSON.stringify(data));

						var remainingDataURL = text.slice(data.message.length);
						if (remainingDataURL.length) setTimeout(function () {
						  onReadAsDataURL(null, remainingDataURL); // continue transmitting
						}, 500)
					};
}


/* Receive file */
var arrayToStoreChunks = [];

function handleMessage(event) {
	trace('Received text message: ' + event.data);
	//receiveTextarea.value = event.data;
	var data = JSON.parse(event.data);

    arrayToStoreChunks.push(data.message); // pushing chunks in array

    if (data.last) {
        saveToDisk(arrayToStoreChunks.join(''), 'download');
        arrayToStoreChunks = []; // resetting array
    }
}

function saveToDisk(fileUrl, fileName) {
	console.log('Transfer finished, in save to disk function now', room);
    var save = document.createElement('a');
    save.href = fileUrl;
    save.target = '_blank';
    save.download = fileName || fileUrl;

    var event = document.createEvent('Event');
    event.initEvent('click', true, true);
    save.dispatchEvent(event);
    (window.URL || window.webkitURL).revokeObjectURL(save.href);
}