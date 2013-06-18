var pc_conf = {"iceServers":[{"url":"stun:stun.l.google.com:19302"}]};
var remoteVideo;
var started = false;
var localvideo;
var localStream = null;
var peerCon;
var socket;



function openChannel() {
    console.log("Opening channel.");
    socket = new WebSocket('ws:192.168.1.102:1337/');
}

function doCall() {
    console.log("Sending offer to peer.");
    peerCon.createOffer(setLocalAndSendMessage);
}
function onIceCandidate(event) {
    if (event.candidate) {
        sendMessage({type: 'candidate',
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate});
    } else {
        console.log("End of candidates.");
    }
}

function processSignalingMessage(message) {
      var msg = JSON.parse(message);
      if (msg.type == 'offer') {
          peerCon.setRemoteDescription(new RTCSessionDescription(msg));
          doAnswer();
          console.log("Set remote description.");
      } else if (msg.type === 'answer') {
        peerCon.setRemoteDescription(new RTCSessionDescription(msg));
      } else if (msg.type === 'candidate') {
        var candidate = new RTCIceCandidate({sdpMLineIndex:msg.label, candidate:msg.candidate});
        peerCon.addIceCandidate(candidate);
      } else if (msg.type === 'bye' && started) {
          onRemoteHangup();
      }
}

function doAnswer() {
      console.log("Sending answer to peer.");
      peerCon.createAnswer(setLocalAndSendMessage);
}

function setLocalAndSendMessage(sessionDescription) {
        sessionDescription.sdp = preferOpus(sessionDescription.sdp);
        peerCon.setLocalDescription(sessionDescription);
        sendMessage(sessionDescription);
}

function sendMessage(message) {
      var msgString = JSON.stringify(message);
        console.log('C->S: ' + msgString);
       socket.send(msgString);
}

function onRemoteStream(event) {
    attachMediaStream(remoteVideo, event.stream);
    //remoteVideo.src = event.stream;
    remoteVideo.play();
}

attachMediaStream = function(element, stream) {
    element.src = webkitURL.createObjectURL(stream);
};

function initialize() {
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    navigator.getUserMedia({audio: false, video: true}, function(localMediaStream) {
    localvideo = document.querySelector("localvideo");
    remoteVideo = document.getElementById("remotevideo");
    RTCPeerConnection = webkitRTCPeerConnection;

    try {
       localvideo.src = window.URL.createObjectURL(localMediaStream);
       localStream = localMediaStream;
       peerCon = new RTCPeerConnection(pc_conf);
       peerCon.onicecandidate = onIceCandidate;
       peerCon.onaddstream = onRemoteStream;
       peerCon.addStream(localStream);
       localvideo.play();
    } catch (e) {
        console.log("Error settinglocalvideo src: ", e);
    }
    }, function (error) {
        console.log("navigator.getUserMedia error: ", error);
    });
    openChannel();
}
function onChannelMessage(message) {
    processSignalingMessage(message.data);
}
initialize();
socket.addEventListener("message", onChannelMessage, false);

  function preferOpus(sdp) {
    var sdpLines = sdp.split('\r\n');

    // Search for m line.
    for (var i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('m=audio') !== -1) {
          var mLineIndex = i;
          break;
        } 
    }
    if (mLineIndex === null)
      return sdp;

    // If Opus is available, set it as the default in m line.
    for (var i = 0; i < sdpLines.length; i++) {
      if (sdpLines[i].search('opus/48000') !== -1) {        
        var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
        if (opusPayload)
          sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
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
    return (result && result.length == 2)? result[1]: null;
  }

  // Set the selected codec to the first in m line.
  function setDefaultCodec(mLine, payload) {
    var elements = mLine.split(' ');
    var newLine = new Array();
    var index = 0;
    for (var i = 0; i < elements.length; i++) {
      if (index === 3) // Format of media starts from the fourth.
        newLine[index++] = payload; // Put target payload to the first.
      if (elements[i] !== payload)
        newLine[index++] = elements[i];
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

