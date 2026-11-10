import {Muxer,ArrayBufferTarget} from 'webm-muxer';
export async function encodeVideo(frames,fps=8){
 if(!globalThis.VideoEncoder||!globalThis.VideoFrame)throw Error('This browser cannot encode video with WebCodecs. Try a current Chrome or Edge.');
 const target=new ArrayBufferTarget();const muxer=new Muxer({target,video:{codec:'V_VP8',width:256,height:256,frameRate:fps},firstTimestampBehavior:'offset'});let failure;const encoder=new VideoEncoder({output:(chunk,meta)=>muxer.addVideoChunk(chunk,meta),error:e=>failure=e});
 const config={codec:'vp8',width:256,height:256,bitrate:2000000,framerate:fps};const support=await VideoEncoder.isConfigSupported(config);if(!support.supported)throw Error('VP8 video encoding is unavailable in this browser.');encoder.configure(config);
 const canvas=new OffscreenCanvas(256,256);const context=canvas.getContext('2d');try{for(let i=0;i<frames.length;i++){context.putImageData(frames[i],0,0);const frame=new VideoFrame(canvas,{timestamp:Math.round(i*1000000/fps),duration:Math.round(1000000/fps)});encoder.encode(frame,{keyFrame:i===0});frame.close()}await encoder.flush();if(failure)throw failure;muxer.finalize();if(target.buffer.byteLength<1024)throw Error('Video encoding produced an empty file.');return new Blob([target.buffer],{type:'video/webm'})}finally{encoder.close()}
}
