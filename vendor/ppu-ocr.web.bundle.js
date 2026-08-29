(()=>{var S_=Object.defineProperty;var At=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(t,r)=>(typeof require<"u"?require:t)[r]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var iu=(e,t,r)=>()=>{if(r)throw r[0];try{return e&&(t=e(e=0)),t}catch(i){throw r=[i],i}};var rn=(e,t)=>{for(var r in t)S_(e,r,{get:t[r],enumerable:!0})};var ng={};rn(ng,{BLANK_INDEX:()=>eg,MIN_CROP_WIDTH:()=>sr,UNK_TOKEN:()=>tg,ctcGreedyDecode:()=>ns,decodeLogitsRow:()=>ss,decodeResults:()=>as,injectGapSpaces:()=>rg,refineDecodedChars:()=>ig});function Jm(e){return new RegExp("\\p{L}","u").test(e)?0:new RegExp("\\p{N}","u").test(e)?1:2}function rg(e,t){if(e.length<4)return;let r=[];for(let s=1;s<t.length;s++)r.push((t[s]??0)-(t[s-1]??0));let i=[...r].sort((s,o)=>s-o),n=i[Math.floor(i.length/2)]??0;if(n<=0)return;let a=i.find(s=>s>0)??0;if(!(a<=0))for(let s=e.length-1;s>=1;s--){let o=t[s-1]??0,l=t[s]??0,d=Jm(e[s]??"")===Jm(e[s-1]??"")?Cb:kb;l-o>n+d*a&&e[s]!==" "&&e[s-1]!==" "&&e[s]!==e[s-1]&&(e.splice(s,0," "),t.splice(s,0,(o+l)/2))}}function ig(e,t){for(let r=e.length-1;r>=1;r--)e[r]===" "&&e[r-1]===" "&&(e.splice(r,1),t.splice(r,1));if(!Ob.test(e.join("")))for(let r=0;r<e.length;r++){let i=e[r]?.codePointAt(0)??0;i>=65281&&i<=65374?e[r]=String.fromCodePoint(i-zb):i===12288&&(e[r]=" ")}}function ns(e,t,r,i,n=!1){let a=i.length,s=a-1,o=[],l=-1,d=0,h=0,c=[];for(let y=0;y<t;y++){let _=y*r,w=e[_],S=0;for(let v=1;v<r;v++){let b=e[_+v];b>w&&(w=b,S=v)}if(S===eg||S===l){l=S;continue}if(S>=0&&S<a){n&&S!==s&&(e[_+s]??0)>.001&&o[o.length-1]!==" "&&(o.push(" "),c.push((y+.5)/t));let v=i[S]??"";S===s?v!==tg&&(o.push(" "),d+=w,h++,c.push((y+.5)/t)):(o.push(v),d+=w,h++,c.push((y+.5)/t))}l=S}rg(o,c),ig(o,c);let f=h>0?d/h:0;return{text:o.join(""),confidence:f,positions:c}}function as(e,t,r,i=!1,n=!1){let a=e.data,s=e.dims,o=s[1],l=s[2]??r;if(!t)return{text:"",confidence:0,positions:[]};let d=t;return t.length===l-1?d=["",...t]:l!==t.length&&i&&console.warn(`Warning: Model output classes (${l}) does not match dictionary length (${t.length}).
 Consider using our model & dictionary catalogue at https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models.`),ns(a,o,l,d,n)}function ss(e,t,r,i,n=!1){let a=i;return i.length===r-1&&(a=["",...i]),ns(e,t,r,a,n)}var eg,tg,sr,kb,Cb,zb,Ob,or=iu(()=>{eg=0,tg="<unk>",sr=8,kb=1.5,Cb=2.5;zb=65248,Ob=/[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/});var og={};rn(og,{createImageTensor:()=>ag,createImageTensorFromCanvas:()=>os,createImageTensorFromMat:()=>sg,preprocessImage:()=>Dr});async function Dr(e,t,r,i){let n=e.width,a=e.height;if(a===0||n===0)throw new Error(`Crop dimensions are zero: ${n}x${a}`);let s=n/a,o=Math.max(sr,Math.round(t*s));if(r){let h=new r.ImageProcessor(e);try{h.resize({width:o,height:t});let c=h.toMat();return c.isContinuous()&&(c.channels()===4||c.channels()===1)?{imageTensor:sg(c,o,t),tensorWidth:o,tensorHeight:t}:{imageTensor:os(h.toCanvas(),o,t),tensorWidth:o,tensorHeight:t}}finally{h.destroy()}}let l=i(e).resize({width:o,height:t});return{imageTensor:ag(l,o,t),tensorWidth:o,tensorHeight:t}}function ag(e,t,r){let i=e.toCanvas();return os(i,t,r)}function os(e,t,r){let a=e.getContext("2d").getImageData(0,0,t,r).data,s=r*t,o=new Float32Array(3*s),l=1/127.5;for(let d=0,h=0;d<s;d++,h+=4)o[d]=(a[h]??0)*l-1;return o.copyWithin(s,0,s),o.copyWithin(s*2,0,s),o}function sg(e,t,r){let i=e.channels(),n=e.data,a=r*t,s=new Float32Array(3*a),o=1/127.5;for(let l=0,d=0;l<a;l++,d+=i)s[l]=n[d]*o-1;return s.copyWithin(a,0,a),s.copyWithin(a*2,0,a),s}var Ci=iu(()=>{or()});var ie="https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/main",xe="https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/main",T_={detection:`${ie}/detection/ort/PP-OCRv6_small_det.ort`,recognition:`${ie}/recognition/ort/PP-OCRv6_small_rec.ort`,charactersDictionary:`${xe}/recognition/ppocrv6_dict.txt`},E_={detection:`${ie}/detection/ort/PP-OCRv6_medium_det.ort`,recognition:`${ie}/recognition/ort/PP-OCRv6_medium_rec.ort`,charactersDictionary:`${xe}/recognition/ppocrv6_dict.txt`},nu={detection:`${ie}/detection/ort/PP-OCRv6_tiny_det.ort`,recognition:`${ie}/recognition/ort/PP-OCRv6_tiny_rec.ort`,charactersDictionary:`${xe}/recognition/ppocrv6_tiny_dict.txt`},I_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.ort`,recognition:`${ie}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.ort`,charactersDictionary:`${xe}/recognition/multi/en/v5/ppocrv5_en_dict.txt`},k_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.ort`,recognition:`${ie}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer_int8.ort`,charactersDictionary:`${xe}/recognition/multi/en/v5/ppocrv5_en_dict.txt`},C_={detection:`${ie}/detection/PP-OCRv5_server_det_infer.onnx`,recognition:`${ie}/recognition/PP-OCRv5_server_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/ppocrv5_dict.txt`},z_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/PP-OCRv5_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/ppocrv5_dict.txt`},O_={detection:`${ie}/detection/PP-OCRv5_server_det_infer.onnx`,recognition:`${ie}/recognition/PP-OCRv5_server_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/ppocrv5_dict.txt`},A_={detection:`${ie}/detection/PP-OCRv4_mobile_det_infer.onnx`,recognition:`${ie}/recognition/multi/en/v4/en_PP-OCRv4_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/multi/en/v4/en_dict.txt`},R_={detection:`${ie}/detection/PP-OCRv4_mobile_det_infer.onnx`,recognition:`${ie}/recognition/PP-OCRv4_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/ppocrv4_dict.txt`},D_={detection:`${ie}/detection/PP-OCRv4_server_det_infer.onnx`,recognition:`${ie}/recognition/PP-OCRv4_server_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/ppocrv4_dict.txt`},M_={detection:`${ie}/detection/PP-OCRv4_server_det_infer.onnx`,recognition:`${ie}/recognition/PP-OCRv4_server_rec_doc_infer.onnx`,charactersDictionary:`${xe}/recognition/ppocrv4_doc_dict.txt`},B_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/PP-OCRv3_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/ppocrv3_dict.txt`},N_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/multi/japan/v3/japan_PP-OCRv3_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/multi/japan/v3/japan_dict.txt`},P_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/multi/arabic/v5/arabic_PP-OCRv5_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/multi/arabic/v5/ppocrv5_arabic_dict.txt`},L_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/multi/cyrillic/v5/cyrillic_PP-OCRv5_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/multi/cyrillic/v5/ppocrv5_cyrillic_dict.txt`},U_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/multi/devanagari/v5/devanagari_PP-OCRv5_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/multi/devanagari/v5/ppocrv5_devanagari_dict.txt`},W_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/multi/el/v5/el_PP-OCRv5_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/multi/el/v5/ppocrv5_el_dict.txt`},q_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/multi/eslav/v5/eslav_PP-OCRv5_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/multi/eslav/v5/ppocrv5_eslav_dict.txt`},V_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/multi/korean/v5/korean_PP-OCRv5_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/multi/korean/v5/ppocrv5_korean_dict.txt`},G_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/multi/latin/v5/latin_PP-OCRv5_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/multi/latin/v5/ppocrv5_latin_dict.txt`},F_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/multi/ta/v5/ta_PP-OCRv5_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/multi/ta/v5/ppocrv5_ta_dict.txt`},H_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/multi/te/v5/te_PP-OCRv5_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/multi/te/v5/ppocrv5_te_dict.txt`},j_={detection:`${ie}/detection/PP-OCRv5_mobile_det_infer.onnx`,recognition:`${ie}/recognition/multi/th/v5/th_PP-OCRv5_mobile_rec_infer.onnx`,charactersDictionary:`${xe}/recognition/multi/th/v5/ppocrv5_th_dict.txt`},au=nu,_t=au;var jt={};rn(jt,{InferenceSession:()=>$a,TRACE:()=>Cr,TRACE_EVENT_BEGIN:()=>xt,TRACE_EVENT_END:()=>St,TRACE_FUNC_BEGIN:()=>et,TRACE_FUNC_END:()=>Ve,Tensor:()=>Je,default:()=>fb,env:()=>ge,registerBackend:()=>Wt});var Qe={};var wa=Object.defineProperty,K_=Object.getOwnPropertyDescriptor,X_=Object.getOwnPropertyNames,Z_=Object.prototype.hasOwnProperty,Y_=(e=>typeof At<"u"?At:typeof Proxy<"u"?new Proxy(e,{get:(t,r)=>(typeof At<"u"?At:t)[r]}):e)(function(e){if(typeof At<"u")return At.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')}),L=(e,t,r)=>()=>{if(r)throw r[0];try{return e&&(t=e(e=0)),t}catch(i){throw r=[i],i}},er=(e,t)=>{for(var r in t)wa(e,r,{get:t[r],enumerable:!0})},Q_=(e,t,r,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of X_(t))!Z_.call(e,n)&&n!==r&&wa(e,n,{get:()=>t[n],enumerable:!(i=K_(t,n))||i.enumerable});return e},kr=e=>Q_(wa({},"__esModule",{value:!0}),e),hr,yt,Wt,su,Hp,jp=L(()=>{"use strict";hr=new Map,yt=[],Wt=(e,t,r)=>{if(t&&typeof t.init=="function"&&typeof t.createInferenceSessionHandler=="function"){let i=hr.get(e);if(i===void 0)hr.set(e,{backend:t,priority:r});else{if(i.priority>r)return;if(i.priority===r&&i.backend!==t)throw new Error(`cannot register backend "${e}" using priority ${r}`)}if(r>=0){let n=yt.indexOf(e);n!==-1&&yt.splice(n,1);for(let a=0;a<yt.length;a++)if(hr.get(yt[a]).priority<=r){yt.splice(a,0,e);return}yt.push(e)}return}throw new TypeError("not a valid backend")},su=async e=>{let t=hr.get(e);if(!t)return"backend not found.";if(t.initialized)return t.backend;if(t.aborted)return t.error;{let r=!!t.initPromise;try{return r||(t.initPromise=t.backend.init(e)),await t.initPromise,t.initialized=!0,t.backend}catch(i){return r||(t.error=`${i}`,t.aborted=!0),t.error}finally{delete t.initPromise}}},Hp=async e=>{let t=e.executionProviders||[],r=t.map(l=>typeof l=="string"?l:l.name),i=r.length===0?yt:r,n,a=[],s=new Set;for(let l of i){let d=await su(l);typeof d=="string"?a.push({name:l,err:d}):(n||(n=d),n===d&&s.add(l))}if(!n)throw new Error(`no available backend found. ERR: ${a.map(l=>`[${l.name}] ${l.err}`).join(", ")}`);for(let{name:l,err:d}of a)r.includes(l)&&console.warn(`removing requested execution provider "${l}" from session options because it is not available: ${d}`);let o=t.filter(l=>s.has(typeof l=="string"?l:l.name));return[n,new Proxy(e,{get:(l,d)=>d==="executionProviders"?o:Reflect.get(l,d)})]}}),J_=L(()=>{"use strict";jp()}),Kp,ey=L(()=>{"use strict";Kp="1.29.0"}),nn,Ae,Xp=L(()=>{"use strict";ey(),nn="warning",Ae={wasm:{},webgl:{},webgpu:{},versions:{common:Kp},set logLevel(e){if(e!==void 0){if(typeof e!="string"||["verbose","info","warning","error","fatal"].indexOf(e)===-1)throw new Error(`Unsupported logging level: ${e}`);nn=e}},get logLevel(){return nn}},Object.defineProperty(Ae,"logLevel",{enumerable:!0})}),ge,ty=L(()=>{"use strict";Xp(),ge=Ae}),Zp,Yp,ry=L(()=>{"use strict";Zp=(e,t)=>{let r=typeof document<"u"?document.createElement("canvas"):new OffscreenCanvas(1,1);r.width=e.dims[3],r.height=e.dims[2];let i=r.getContext("2d");if(i!=null){let n,a;t?.tensorLayout!==void 0&&t.tensorLayout==="NHWC"?(n=e.dims[2],a=e.dims[3]):(n=e.dims[3],a=e.dims[2]);let s=t?.format!==void 0?t.format:"RGB",o=t?.norm,l,d;o===void 0||o.mean===void 0?l=[255,255,255,255]:typeof o.mean=="number"?l=[o.mean,o.mean,o.mean,o.mean]:(l=[o.mean[0],o.mean[1],o.mean[2],0],o.mean[3]!==void 0&&(l[3]=o.mean[3])),o===void 0||o.bias===void 0?d=[0,0,0,0]:typeof o.bias=="number"?d=[o.bias,o.bias,o.bias,o.bias]:(d=[o.bias[0],o.bias[1],o.bias[2],0],o.bias[3]!==void 0&&(d[3]=o.bias[3]));let h=a*n,c=0,f=h,y=h*2,_=-1;s==="RGBA"?(c=0,f=h,y=h*2,_=h*3):s==="RGB"?(c=0,f=h,y=h*2):s==="RBG"&&(c=0,y=h,f=h*2);for(let w=0;w<a;w++)for(let S=0;S<n;S++){let v=(e.data[c++]-d[0])*l[0],b=(e.data[f++]-d[1])*l[1],T=(e.data[y++]-d[2])*l[2],E=_===-1?255:(e.data[_++]-d[3])*l[3];i.fillStyle="rgba("+v+","+b+","+T+","+E+")",i.fillRect(S,w,1,1)}if("toDataURL"in r)return r.toDataURL();throw new Error("toDataURL is not supported")}else throw new Error("Can not access image data")},Yp=(e,t)=>{let r=typeof document<"u"?document.createElement("canvas").getContext("2d"):new OffscreenCanvas(1,1).getContext("2d"),i;if(r!=null){let n,a,s;t?.tensorLayout!==void 0&&t.tensorLayout==="NHWC"?(n=e.dims[2],a=e.dims[1],s=e.dims[3]):(n=e.dims[3],a=e.dims[2],s=e.dims[1]);let o=t!==void 0&&t.format!==void 0?t.format:"RGB",l=t?.norm,d,h;l===void 0||l.mean===void 0?d=[255,255,255,255]:typeof l.mean=="number"?d=[l.mean,l.mean,l.mean,l.mean]:(d=[l.mean[0],l.mean[1],l.mean[2],255],l.mean[3]!==void 0&&(d[3]=l.mean[3])),l===void 0||l.bias===void 0?h=[0,0,0,0]:typeof l.bias=="number"?h=[l.bias,l.bias,l.bias,l.bias]:(h=[l.bias[0],l.bias[1],l.bias[2],0],l.bias[3]!==void 0&&(h[3]=l.bias[3]));let c=a*n;if(t!==void 0&&(t.format!==void 0&&s===4&&t.format!=="RGBA"||s===3&&t.format!=="RGB"&&t.format!=="BGR"))throw new Error("Tensor format doesn't match input tensor dims");let f=4,y=0,_=1,w=2,S=3,v=0,b=c,T=c*2,E=-1;o==="RGBA"?(v=0,b=c,T=c*2,E=c*3):o==="RGB"?(v=0,b=c,T=c*2):o==="RBG"&&(v=0,T=c,b=c*2),i=r.createImageData(n,a);for(let I=0;I<a*n;y+=f,_+=f,w+=f,S+=f,I++)i.data[y]=(e.data[v++]-h[0])*d[0],i.data[_]=(e.data[b++]-h[1])*d[1],i.data[w]=(e.data[T++]-h[2])*d[2],i.data[S]=E===-1?255:(e.data[E++]-h[3])*d[3]}else throw new Error("Can not access image data");return i}}),Xr,Qp,Jp,ec,tc,rc,iy=L(()=>{"use strict";va(),Xr=(e,t)=>{if(e===void 0)throw new Error("Image buffer must be defined");if(t.height===void 0||t.width===void 0)throw new Error("Image height and width must be defined");if(t.tensorLayout==="NHWC")throw new Error("NHWC Tensor layout is not supported yet");let{height:r,width:i}=t,n=t.norm??{mean:255,bias:0},a,s;typeof n.mean=="number"?a=[n.mean,n.mean,n.mean,n.mean]:a=[n.mean[0],n.mean[1],n.mean[2],n.mean[3]??255],typeof n.bias=="number"?s=[n.bias,n.bias,n.bias,n.bias]:s=[n.bias[0],n.bias[1],n.bias[2],n.bias[3]??0];let o=t.format!==void 0?t.format:"RGBA",l=t.tensorFormat!==void 0&&t.tensorFormat!==void 0?t.tensorFormat:"RGB",d=r*i,h=l==="RGBA"?new Float32Array(d*4):new Float32Array(d*3),c=4,f=0,y=1,_=2,w=3,S=0,v=d,b=d*2,T=-1;o==="RGB"&&(c=3,f=0,y=1,_=2,w=-1),l==="RGBA"?T=d*3:l==="RBG"?(S=0,b=d,v=d*2):l==="BGR"&&(b=0,v=d,S=d*2);for(let E=0;E<d;E++,f+=c,_+=c,y+=c,w+=c)h[S++]=(e[f]+s[0])/a[0],h[v++]=(e[y]+s[1])/a[1],h[b++]=(e[_]+s[2])/a[2],T!==-1&&w!==-1&&(h[T++]=(e[w]+s[3])/a[3]);return l==="RGBA"?new Le("float32",h,[1,4,r,i]):new Le("float32",h,[1,3,r,i])},Qp=async(e,t)=>{let r=typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement,i=typeof ImageData<"u"&&e instanceof ImageData,n=typeof ImageBitmap<"u"&&e instanceof ImageBitmap,a=typeof e=="string",s,o=t??{},l=()=>{if(typeof document<"u")return document.createElement("canvas");if(typeof OffscreenCanvas<"u")return new OffscreenCanvas(1,1);throw new Error("Canvas is not supported")},d=h=>typeof HTMLCanvasElement<"u"&&h instanceof HTMLCanvasElement||h instanceof OffscreenCanvas?h.getContext("2d"):null;if(r){let h=l();h.width=e.width,h.height=e.height;let c=d(h);if(c!=null){let f=e.height,y=e.width;if(t!==void 0&&t.resizedHeight!==void 0&&t.resizedWidth!==void 0&&(f=t.resizedHeight,y=t.resizedWidth),t!==void 0){if(o=t,t.tensorFormat!==void 0)throw new Error("Image input config format must be RGBA for HTMLImageElement");o.tensorFormat="RGBA",o.height=f,o.width=y}else o.tensorFormat="RGBA",o.height=f,o.width=y;c.drawImage(e,0,0),s=c.getImageData(0,0,y,f).data}else throw new Error("Can not access image data")}else if(i){let h,c;if(t!==void 0&&t.resizedWidth!==void 0&&t.resizedHeight!==void 0?(h=t.resizedHeight,c=t.resizedWidth):(h=e.height,c=e.width),t!==void 0&&(o=t),o.format="RGBA",o.height=h,o.width=c,t!==void 0){let f=l();f.width=c,f.height=h;let y=d(f);if(y!=null)y.putImageData(e,0,0),s=y.getImageData(0,0,c,h).data;else throw new Error("Can not access image data")}else s=e.data}else if(n){if(t===void 0)throw new Error("Please provide image config with format for Imagebitmap");let h=l();h.width=e.width,h.height=e.height;let c=d(h);if(c!=null){let f=e.height,y=e.width;return c.drawImage(e,0,0,y,f),s=c.getImageData(0,0,y,f).data,o.height=f,o.width=y,Xr(s,o)}else throw new Error("Can not access image data")}else{if(a)return new Promise((h,c)=>{let f=l(),y=d(f);if(!e||!y)return c();let _=new Image;_.crossOrigin="Anonymous",_.src=e,_.onload=()=>{f.width=_.width,f.height=_.height,y.drawImage(_,0,0,f.width,f.height);let w=y.getImageData(0,0,f.width,f.height);o.height=f.height,o.width=f.width,h(Xr(w.data,o))}});throw new Error("Input data provided is not supported - aborted tensor creation")}if(s!==void 0)return Xr(s,o);throw new Error("Input data provided is not supported - aborted tensor creation")},Jp=(e,t)=>{let{width:r,height:i,download:n,dispose:a}=t,s=[1,i,r,4];return new Le({location:"texture",type:"float32",texture:e,dims:s,download:n,dispose:a})},ec=(e,t)=>{let{dataType:r,dims:i,download:n,dispose:a}=t;return new Le({location:"gpu-buffer",type:r??"float32",gpuBuffer:e,dims:i,download:n,dispose:a})},tc=(e,t)=>{let{dataType:r,dims:i,download:n,dispose:a}=t;return new Le({location:"ml-tensor",type:r??"float32",mlTensor:e,dims:i,download:n,dispose:a})},rc=(e,t,r)=>new Le({location:"cpu-pinned",type:e,data:t,dims:r??[t.length]})}),Pt,Sr,an,ic,ny=L(()=>{"use strict";Pt=new Map([["float32",Float32Array],["uint8",Uint8Array],["int8",Int8Array],["uint16",Uint16Array],["int16",Int16Array],["int32",Int32Array],["bool",Uint8Array],["float64",Float64Array],["uint32",Uint32Array],["int4",Uint8Array],["uint4",Uint8Array]]),Sr=new Map([[Float32Array,"float32"],[Uint8Array,"uint8"],[Int8Array,"int8"],[Uint16Array,"uint16"],[Int16Array,"int16"],[Int32Array,"int32"],[Float64Array,"float64"],[Uint32Array,"uint32"]]),an=!1,ic=()=>{if(!an){an=!0;let e=typeof BigInt64Array<"u"&&BigInt64Array.from,t=typeof BigUint64Array<"u"&&BigUint64Array.from,r=globalThis.Float16Array,i=typeof r<"u"&&r.from;e&&(Pt.set("int64",BigInt64Array),Sr.set(BigInt64Array,"int64")),t&&(Pt.set("uint64",BigUint64Array),Sr.set(BigUint64Array,"uint64")),i?(Pt.set("float16",r),Sr.set(r,"float16")):Pt.set("float16",Uint16Array)}}}),nc,ac,ay=L(()=>{"use strict";va(),nc=e=>{let t=1;for(let r=0;r<e.length;r++){let i=e[r];if(typeof i!="number"||!Number.isSafeInteger(i))throw new TypeError(`dims[${r}] must be an integer, got: ${i}`);if(i<0)throw new RangeError(`dims[${r}] must be a non-negative integer, got: ${i}`);t*=i}return t},ac=(e,t)=>{switch(e.location){case"cpu":return new Le(e.type,e.data,t);case"cpu-pinned":return new Le({location:"cpu-pinned",data:e.data,type:e.type,dims:t});case"texture":return new Le({location:"texture",texture:e.texture,type:e.type,dims:t});case"gpu-buffer":return new Le({location:"gpu-buffer",gpuBuffer:e.gpuBuffer,type:e.type,dims:t});case"ml-tensor":return new Le({location:"ml-tensor",mlTensor:e.mlTensor,type:e.type,dims:t});default:throw new Error(`tensorReshape: tensor location ${e.location} is not supported`)}}}),Le,va=L(()=>{"use strict";ry(),iy(),ny(),ay(),Le=class{constructor(e,t,r){ic();let i,n;if(typeof e=="object"&&"location"in e)switch(this.dataLocation=e.location,i=e.type,n=e.dims,e.location){case"cpu-pinned":{let s=Pt.get(i);if(!s)throw new TypeError(`unsupported type "${i}" to create tensor from pinned buffer`);if(!(e.data instanceof s))throw new TypeError(`buffer should be of type ${s.name}`);this.cpuData=e.data;break}case"texture":{if(i!=="float32")throw new TypeError(`unsupported type "${i}" to create tensor from texture`);this.gpuTextureData=e.texture,this.downloader=e.download,this.disposer=e.dispose;break}case"gpu-buffer":{if(i!=="float32"&&i!=="float16"&&i!=="int32"&&i!=="int64"&&i!=="uint32"&&i!=="uint8"&&i!=="bool"&&i!=="uint4"&&i!=="int4")throw new TypeError(`unsupported type "${i}" to create tensor from gpu buffer`);this.gpuBufferData=e.gpuBuffer,this.downloader=e.download,this.disposer=e.dispose;break}case"ml-tensor":{if(i!=="float32"&&i!=="float16"&&i!=="int32"&&i!=="int64"&&i!=="uint32"&&i!=="uint64"&&i!=="int8"&&i!=="uint8"&&i!=="bool"&&i!=="uint4"&&i!=="int4")throw new TypeError(`unsupported type "${i}" to create tensor from MLTensor`);this.mlTensorData=e.mlTensor,this.downloader=e.download,this.disposer=e.dispose;break}default:throw new Error(`Tensor constructor: unsupported location '${this.dataLocation}'`)}else{let s,o;if(typeof e=="string")if(i=e,o=r,e==="string"){if(!Array.isArray(t))throw new TypeError("A string tensor's data must be a string array.");s=t}else{let l=Pt.get(e);if(l===void 0)throw new TypeError(`Unsupported tensor type: ${e}.`);if(Array.isArray(t)){if(e==="float16"&&l===Uint16Array||e==="uint4"||e==="int4")throw new TypeError(`Creating a ${e} tensor from number array is not supported. Please use ${l.name} as data.`);e==="uint64"||e==="int64"?s=l.from(t,BigInt):s=l.from(t)}else if(t instanceof l)s=t;else if(t instanceof Uint8ClampedArray)if(e==="uint8")s=Uint8Array.from(t);else throw new TypeError("A Uint8ClampedArray tensor's data must be type of uint8");else if(e==="float16"&&t instanceof Uint16Array&&l!==Uint16Array)s=new globalThis.Float16Array(t.buffer,t.byteOffset,t.length);else throw new TypeError(`A ${i} tensor's data must be type of ${l}`)}else if(o=t,Array.isArray(e)){if(e.length===0)throw new TypeError("Tensor type cannot be inferred from an empty array.");let l=typeof e[0];if(l==="string")i="string",s=e;else if(l==="boolean")i="bool",s=Uint8Array.from(e);else throw new TypeError(`Invalid element type of data array: ${l}.`)}else if(e instanceof Uint8ClampedArray)i="uint8",s=Uint8Array.from(e);else{let l=Sr.get(e.constructor);if(l===void 0)throw new TypeError(`Unsupported type for tensor data: ${e.constructor}.`);i=l,s=e}if(o===void 0)o=[s.length];else if(!Array.isArray(o))throw new TypeError("A tensor's dims must be a number array");n=o,this.cpuData=s,this.dataLocation="cpu"}let a=nc(n);if(this.cpuData&&a!==this.cpuData.length&&!((i==="uint4"||i==="int4")&&Math.ceil(a/2)===this.cpuData.length))throw new Error(`Tensor's size(${a}) does not match data length(${this.cpuData.length}).`);this.type=i,this.dims=n,this.size=a}static async fromImage(e,t){return Qp(e,t)}static fromTexture(e,t){return Jp(e,t)}static fromGpuBuffer(e,t){return ec(e,t)}static fromMLTensor(e,t){return tc(e,t)}static fromPinnedBuffer(e,t,r){return rc(e,t,r)}toDataURL(e){return Zp(this,e)}toImageData(e){return Yp(this,e)}get data(){if(this.ensureValid(),!this.cpuData)throw new Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");return this.cpuData}get location(){return this.dataLocation}get texture(){if(this.ensureValid(),!this.gpuTextureData)throw new Error("The data is not stored as a WebGL texture.");return this.gpuTextureData}get gpuBuffer(){if(this.ensureValid(),!this.gpuBufferData)throw new Error("The data is not stored as a WebGPU buffer.");return this.gpuBufferData}get mlTensor(){if(this.ensureValid(),!this.mlTensorData)throw new Error("The data is not stored as a WebNN MLTensor.");return this.mlTensorData}async getData(e){switch(this.ensureValid(),this.dataLocation){case"cpu":case"cpu-pinned":return this.data;case"texture":case"gpu-buffer":case"ml-tensor":{if(!this.downloader)throw new Error("The current tensor is not created with a specified data downloader.");if(this.isDownloading)throw new Error("The current tensor is being downloaded.");try{this.isDownloading=!0;let t=await this.downloader();return this.downloader=void 0,this.dataLocation="cpu",this.cpuData=t,e&&this.disposer&&(this.disposer(),this.disposer=void 0),t}finally{this.isDownloading=!1}}default:throw new Error(`cannot get data from location: ${this.dataLocation}`)}}dispose(){if(this.isDownloading)throw new Error("The current tensor is being downloaded.");this.disposer&&(this.disposer(),this.disposer=void 0),this.cpuData=void 0,this.gpuTextureData=void 0,this.gpuBufferData=void 0,this.mlTensorData=void 0,this.downloader=void 0,this.isDownloading=void 0,this.dataLocation="none"}ensureValid(){if(this.dataLocation==="none")throw new Error("The tensor is disposed.")}reshape(e){if(this.ensureValid(),this.downloader||this.disposer)throw new Error("Cannot reshape a tensor that owns GPU resource.");return ac(this,e)}}}),Je,sc=L(()=>{"use strict";va(),Je=Le}),Cr,sn,et,Ve,xt,St,oc=L(()=>{"use strict";Xp(),Cr=(e,t)=>{(typeof Ae.trace>"u"?!Ae.wasm.trace:!Ae.trace)||console.timeStamp(`${e}::ORT::${t}`)},sn=(e,t)=>{let r=new Error().stack?.split(/\r\n|\r|\n/g)||[],i=!1;for(let n=0;n<r.length;n++){if(i&&!r[n].includes("TRACE_FUNC")){let a=`FUNC_${e}::${r[n].trim().split(" ")[1]}`;t&&(a+=`::${t}`),Cr("CPU",a);return}r[n].includes("TRACE_FUNC")&&(i=!0)}},et=e=>{(typeof Ae.trace>"u"?!Ae.wasm.trace:!Ae.trace)||sn("BEGIN",e)},Ve=e=>{(typeof Ae.trace>"u"?!Ae.wasm.trace:!Ae.trace)||sn("END",e)},xt=e=>{(typeof Ae.trace>"u"?!Ae.wasm.trace:!Ae.trace)||console.time(`ORT::${e}`)},St=e=>{(typeof Ae.trace>"u"?!Ae.wasm.trace:!Ae.trace)||console.timeEnd(`ORT::${e}`)}}),uc,sy=L(()=>{"use strict";jp(),sc(),oc(),uc=class lc{constructor(t){this.handler=t}async run(t,r,i){et(),xt("InferenceSession.run");let n={},a={};if(typeof t!="object"||t===null||t instanceof Je||Array.isArray(t))throw new TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");let s=!0;if(typeof r=="object"){if(r===null)throw new TypeError("Unexpected argument[1]: cannot be null.");if(r instanceof Je)throw new TypeError("'fetches' cannot be a Tensor");if(Array.isArray(r)){if(r.length===0)throw new TypeError("'fetches' cannot be an empty array.");s=!1;for(let d of r){if(typeof d!="string")throw new TypeError("'fetches' must be a string array or an object.");if(this.outputNames.indexOf(d)===-1)throw new RangeError(`'fetches' contains invalid output name: ${d}.`);n[d]=null}if(typeof i=="object"&&i!==null)a=i;else if(typeof i<"u")throw new TypeError("'options' must be an object.")}else{let d=!1,h=Object.getOwnPropertyNames(r);for(let c of this.outputNames)if(h.indexOf(c)!==-1){let f=r[c];(f===null||f instanceof Je)&&(d=!0,s=!1,n[c]=f)}if(d){if(typeof i=="object"&&i!==null)a=i;else if(typeof i<"u")throw new TypeError("'options' must be an object.")}else a=r}}else if(typeof r<"u")throw new TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");for(let d of this.inputNames)if(typeof t[d]>"u")throw new Error(`input '${d}' is missing in 'feeds'.`);if(s)for(let d of this.outputNames)n[d]=null;let o=await this.handler.run(t,n,a),l={};for(let d in o)if(Object.hasOwnProperty.call(o,d)){let h=o[d];h instanceof Je?l[d]=h:l[d]=new Je(h.type,h.data,h.dims)}return St("InferenceSession.run"),Ve(),l}async release(){return this.handler.dispose()}static async create(t,r,i,n){et(),xt("InferenceSession.create");let a,s={};if(typeof t=="string"){if(a=t,typeof r=="object"&&r!==null)s=r;else if(typeof r<"u")throw new TypeError("'options' must be an object.")}else if(t instanceof Uint8Array){if(a=t,typeof r=="object"&&r!==null)s=r;else if(typeof r<"u")throw new TypeError("'options' must be an object.")}else if(t instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&t instanceof SharedArrayBuffer){let h=t,c=0,f=t.byteLength;if(typeof r=="object"&&r!==null)s=r;else if(typeof r=="number"){if(c=r,!Number.isSafeInteger(c))throw new RangeError("'byteOffset' must be an integer.");if(c<0||c>=h.byteLength)throw new RangeError(`'byteOffset' is out of range [0, ${h.byteLength}).`);if(f=t.byteLength-c,typeof i=="number"){if(f=i,!Number.isSafeInteger(f))throw new RangeError("'byteLength' must be an integer.");if(f<=0||c+f>h.byteLength)throw new RangeError(`'byteLength' is out of range (0, ${h.byteLength-c}].`);if(typeof n=="object"&&n!==null)s=n;else if(typeof n<"u")throw new TypeError("'options' must be an object.")}else if(typeof i<"u")throw new TypeError("'byteLength' must be a number.")}else if(typeof r<"u")throw new TypeError("'options' must be an object.");a=new Uint8Array(h,c,f)}else throw new TypeError("Unexpected argument[0]: must be 'path' or 'buffer'.");let[o,l]=await Hp(s),d=await o.createInferenceSessionHandler(a,l);return St("InferenceSession.create"),Ve(),new lc(d)}startProfiling(){this.handler.startProfiling()}endProfiling(){this.handler.endProfiling()}get inputNames(){return this.handler.inputNames}get outputNames(){return this.handler.outputNames}get inputMetadata(){return this.handler.inputMetadata}get outputMetadata(){return this.handler.outputMetadata}}}),$a,oy=L(()=>{"use strict";sy(),$a=uc}),uy=L(()=>{"use strict"}),ly=L(()=>{"use strict"}),dy=L(()=>{"use strict"}),py=L(()=>{"use strict"}),dc={};er(dc,{InferenceSession:()=>$a,TRACE:()=>Cr,TRACE_EVENT_BEGIN:()=>xt,TRACE_EVENT_END:()=>St,TRACE_FUNC_BEGIN:()=>et,TRACE_FUNC_END:()=>Ve,Tensor:()=>Je,env:()=>ge,registerBackend:()=>Wt});var Ge=L(()=>{"use strict";J_(),ty(),oy(),sc(),uy(),ly(),oc(),dy(),py()}),xa=L(()=>{"use strict"}),pc={};er(pc,{default:()=>cc});var on,un,cc,cy=L(()=>{"use strict";vm(),Ft(),Sa(),on="ort-wasm-proxy-worker",un=globalThis.self?.name===on,un&&(self.onmessage=e=>{let{type:t,in:r}=e.data;try{switch(t){case"init-wasm":Ta(r.wasm).then(()=>{qa(r).then(()=>{postMessage({type:t})},i=>{postMessage({type:t,err:i})})},i=>{postMessage({type:t,err:i})});break;case"init-ep":{let{epName:i,env:n}=r;Va(n,i).then(()=>{postMessage({type:t})},a=>{postMessage({type:t,err:a})});break}case"copy-from":{let{buffer:i}=r,n=_i(i);postMessage({type:t,out:n});break}case"create":{let{model:i,options:n}=r;Ga(i,n).then(a=>{postMessage({type:t,out:a})},a=>{postMessage({type:t,err:a})});break}case"release":Fa(r),postMessage({type:t});break;case"run":{let{sessionId:i,inputIndices:n,inputs:a,outputIndices:s,options:o}=r;Ha(i,n,a,s,new Array(s.length).fill(null),o).then(l=>{l.some(d=>d[3]!=="cpu")?postMessage({type:t,err:"Proxy does not support non-cpu tensor location."}):postMessage({type:t,out:l},Ka([...a,...l]))},l=>{postMessage({type:t,err:l})});break}case"end-profiling":ja(r),postMessage({type:t});break;default:}}catch(i){postMessage({type:t,err:i})}}),cc=un?null:e=>new Worker(e??Pe,{type:"module",name:on})}),hc={};er(hc,{default:()=>fc});async function ou(e={}){var t=e,r=!!globalThis.window,i=!!globalThis.WorkerGlobalScope,n=i&&self.name?.startsWith("em-pthread");t.mountExternalData=(u,p)=>{u.startsWith("./")&&(u=u.substring(2)),(t.Yc||(t.Yc=new Map)).set(u,p)},t.unmountExternalData=()=>{delete t.Yc,delete t.Zd,delete t.Yd,delete t.$d},globalThis.SharedArrayBuffer??new WebAssembly.Memory({initial:0,maximum:0,shared:!0}).buffer.constructor;let a=u=>async(...p)=>{try{if(t.Xc)throw Error("Session already started");let g=t.Xc={Kd:p[0],errors:[]},m=await u(...p);if(t.Xc!==g)throw Error("Session mismatch");t.dd?.flush();let x=g.errors;if(0<x.length){let k=await Promise.all(x);if(k=k.filter(A=>A),0<k.length)throw Error(k.join(`
`))}return m}finally{t.Xc=null}};t.jsepInit=(u,p)=>{if(u==="webgpu"){[t.dd,t.Ad,t.Ed,t.ed,t.Dd,t.$b,t.Fd,t.Hd,t.Bd,t.Cd,t.Gd]=p;let g=t.dd;t.jsepRegisterBuffer=(m,x,k,A)=>g.registerBuffer(m,x,k,A),t.jsepGetBuffer=m=>g.getBuffer(m),t.jsepCreateDownloader=(m,x,k)=>g.createDownloader(m,x,k),t.jsepOnCreateSession=m=>{g.onCreateSession(m)},t.jsepOnReleaseSession=m=>{g.onReleaseSession(m)},t.jsepOnRunStart=m=>g.onRunStart(m),t.Id=(m,x)=>{g.upload(m,x)}}else if(u==="webnn"){let g=p[0];[t.Sd,t.sd,t.webnnEnsureTensor,t.td,t.webnnDownloadTensor,t.Rd,t.webnnEnableTraceEvent]=p.slice(1),t.webnnReleaseTensorId=t.sd,t.webnnUploadTensor=t.td,t.webnnRegisterMLContext=t.Rd,t.webnnOnRunStart=m=>g.onRunStart(m),t.webnnOnRunEnd=g.onRunEnd.bind(g),t.webnnOnReleaseSession=m=>{g.onReleaseSession(m)},t.webnnCreateMLTensorDownloader=(m,x)=>g.createMLTensorDownloader(m,x),t.webnnRegisterMLTensor=(m,x,k,A)=>g.registerMLTensor(m,x,k,A),t.webnnCreateMLContext=m=>g.createMLContext(m),t.webnnRegisterGraphInput=g.registerGraphInput.bind(g),t.webnnIsGraphInput=g.isGraphInput.bind(g),t.webnnRegisterGraphOutput=g.registerGraphOutput.bind(g),t.webnnIsGraphOutput=g.isGraphOutput.bind(g),t.webnnCreateTemporaryTensor=g.createTemporaryTensor.bind(g),t.webnnIsGraphInputOutputTypeSupported=g.isGraphInputOutputTypeSupported.bind(g)}};let s=()=>{let u=p=>(...g)=>{let m=rt;return g=p(...g),rt!=m?new Promise((x,k)=>{Vi={resolve:x,reject:k}}):g};(()=>{for(let p of["_OrtAppendExecutionProvider","_OrtCreateSession","_OrtRun","_OrtRunWithBinding","_OrtBindInput"])t[p]=u(t[p])})(),a!==void 0&&(t._OrtRun=a(t._OrtRun),t._OrtRunWithBinding=a(t._OrtRunWithBinding)),s=void 0};t.asyncInit=()=>{s?.()};var o,l,d=(u,p)=>{throw p},h=Qe.url,c="";if(r||i){try{c=new URL(".",h).href}catch{}i&&(l=u=>{var p=new XMLHttpRequest;return p.open("GET",u,!1),p.responseType="arraybuffer",p.send(null),new Uint8Array(p.response)}),o=async u=>{if(z(u))return new Promise((g,m)=>{var x=new XMLHttpRequest;x.open("GET",u,!0),x.responseType="arraybuffer",x.onload=()=>{x.status==200||x.status==0&&x.response?g(x.response):m(x.status)},x.onerror=m,x.send(null)});var p=await fetch(u,{credentials:"same-origin"});if(p.ok)return p.arrayBuffer();throw Error(p.status+" : "+p.url)}}var f,y,_,w,S,v,b=console.log.bind(console),T=console.error.bind(console),E=b,I=T,C=!1,z=u=>u.startsWith("file://");function $(){ht.buffer!=F.buffer&&Y()}if(n){let u=function(p){try{var g=p.data,m=g.Sc;if(m==="load"){let x=[];self.onmessage=k=>x.push(k),v=()=>{postMessage({Sc:"loaded"});for(let k of x)u(k);self.onmessage=u};for(let k of g.xd)t[k]&&!t[k].proxy||(t[k]=(...A)=>{postMessage({Sc:"callHandler",vd:k,args:A})},k=="print"&&(E=t[k]),k=="printErr"&&(I=t[k]));ht=g.Od,Y(),y=g.Pd,Se(),Kr()}else if(m==="run"){(function(x){var k=($(),U)[x+52>>>2>>>0];x=($(),U)[x+56>>>2>>>0],ho(k,k-x),ue(k)})(g.Rc),Ki(g.Rc,0,0,1,0,0),hs(),Ui(g.Rc),W||(so(),W=!0);try{fg(g.Md,g.bd)}catch(x){if(x!="unwind")throw x}}else g.target!=="setimmediate"&&(m==="checkMailbox"?W&&Wr():m&&(I(`worker: received unknown command ${m}`),I(g)))}catch(x){throw oo(),x}};var B=u,W=!1;self.onunhandledrejection=p=>{throw p.reason||p},self.onmessage=u}var F,q,P,K,O,U,J,re,X,se,N,ee=!1;function Y(){var u=ht.buffer;t.HEAP8=F=new Int8Array(u),P=new Int16Array(u),t.HEAPU8=q=new Uint8Array(u),K=new Uint16Array(u),t.HEAP32=O=new Int32Array(u),t.HEAPU32=U=new Uint32Array(u),J=new Float32Array(u),re=new Float64Array(u),X=new BigInt64Array(u),se=new BigUint64Array(u)}function j(){ee=!0,n?v():st.sb()}function ve(u){throw I(u="Aborted("+u+")"),C=!0,u=new WebAssembly.RuntimeError(u+". Build with -sASSERTIONS for more info."),S?.(u),u}function De(){return{a:{ma:L0,hb:P0,g:mg,J:gg,f:_g,o:yg,i:bg,$:wg,b:vg,S:$g,Ia:bs,n:xg,aa:xs,Ya:Ss,Ea:Ts,Ga:Es,Za:Is,Wa:ks,Pa:Cs,Va:zs,ka:Os,Fa:As,Ca:Rs,Xa:Ds,Da:Ms,cb:Sg,fa:Eg,xa:Ig,va:Cg,ea:Og,N:Ag,H:Rg,wa:Dg,_:Wg,ya:qg,Sa:Vg,Aa:Fg,Ja:Hg,ta:jg,ga:Kg,Ra:Ui,$a:Xg,Q:Jg,r:n0,c:Pi,ib:a0,y:s0,M:o0,D:u0,l:l0,s:Vs,jb:d0,I:p0,R:c0,j:h0,u:f0,q:m0,k:g0,Ma:_0,Na:y0,Oa:b0,Ka:js,La:Ks,ua:Xs,eb:v0,bb:S0,v:T0,ba:E0,ha:I0,ab:$0,V:k0,_a:C0,Ba:z0,F:w0,T:O0,la:Hr,za:R0,gb:A0,fb:D0,Ta:Js,Ua:eo,Ha:Ri,U:to,ja:ro,Qa:io,ia:no,lb:v_,na:g_,mb:w_,oa:m_,G:a_,e:V0,t:W0,w:U0,B:J0,nb:c_,Z:p_,x:H0,pa:h_,X:__,ca:d_,ob:l_,pb:u_,O:e_,qa:o_,qb:s_,L:i_,Y:f_,d:q0,A:F0,m:G0,kb:$_,p:K0,z:X0,C:j0,E:Z0,K:t_,ra:n_,P:y_,da:r_,W:b_,rb:Q0,sa:Y0,h:B0,a:ht,db:Ai}}}async function Se(){function u(m,x){var k=st=m.exports;m={};for(let[A,M]of Object.entries(k))typeof M=="function"?(k=Zg(M),m[A]=k):m[A]=M;return st=m,st=(function(){var A=st,M=G=>oe=>G(oe)>>>0,V=G=>()=>G()>>>0;return(A=Object.assign({},A)).tb=M(A.tb),A.Xb=V(A.Xb),A.Zb=M(A.Zb),A.lc=M(A.lc),A.mc=V(A.mc),A.qc=M(A.qc),A})(),ps.push(st._b),ao=(m=st).tb,so=m.ub,t._OrtInit=m.vb,t._OrtGetLastError=m.wb,t._OrtCreateSessionOptions=m.xb,t._OrtAppendExecutionProvider=m.yb,t._OrtAddFreeDimensionOverride=m.zb,t._OrtAddSessionConfigEntry=m.Ab,t._OrtReleaseSessionOptions=m.Bb,t._OrtCreateSession=m.Cb,t._OrtReleaseSession=m.Db,t._OrtGetInputOutputCount=m.Eb,t._OrtGetInputOutputMetadata=m.Fb,t._OrtFree=m.Gb,t._OrtCreateTensor=m.Hb,t._OrtGetTensorData=m.Ib,t._OrtReleaseTensor=m.Jb,t._OrtCreateRunOptions=m.Kb,t._OrtAddRunConfigEntry=m.Lb,t._OrtReleaseRunOptions=m.Mb,t._OrtCreateBinding=m.Nb,t._OrtBindInput=m.Ob,t._OrtBindOutput=m.Pb,t._OrtClearBoundOutputs=m.Qb,t._OrtReleaseBinding=m.Rb,t._OrtRunWithBinding=m.Sb,t._OrtRun=m.Tb,t._OrtEndProfiling=m.Ub,t._JsepOutput=m.Vb,t._JsepGetNodeName=m.Wb,jr=m.Xb,it=t._free=m.Yb,pr=t._malloc=m.Zb,Ki=m.ac,oo=m.bc,uo=m.cc,lo=m.dc,Xi=m.ec,po=m.fc,co=m.gc,de=m.hc,cr=m.ic,ho=m.jc,ue=m.kc,Zi=m.lc,le=m.mc,fo=m.nc,Yi=m.oc,mo=m.pc,go=m.qc,_o=m.rc,Qi=m.sc,yo=m.tc,bo=m.uc,wo=m.vc,vo=m.wc,$o=m.xc,xo=m.yc,So=m.zc,To=m.Ac,Eo=m.Bc,Io=m.Cc,ko=m.Dc,Co=m.Ec,zo=m.Fc,Oo=m.Gc,Ao=m.Hc,Ro=m.Ic,Do=m.Jc,Mo=m.Kc,Bo=m.Lc,No=m.Mc,Po=m.Nc,Lo=m.Pc,Uo=m.Qc,Wo=m.$c,qo=m.ad,Vo=m.fd,Go=m.kd,Fo=m.ld,Ho=m.md,jo=m.nd,Ko=m.od,Xo=m.pd,Zo=m.qd,Yo=m.rd,Qo=m.wd,Jo=m.Ud,eu=m.Vd,tu=m.Wd,ru=m.Xd,y=x,st}var p,g=De();return t.instantiateWasm?new Promise(m=>{t.instantiateWasm(g,(x,k)=>{m(u(x,k))})}):n?u(new WebAssembly.Instance(y,De()),y):(N??=t.locateFile?t.locateFile?t.locateFile("ort-wasm-simd-threaded.jsep.wasm",c):c+"ort-wasm-simd-threaded.jsep.wasm":new URL("ort-wasm-simd-threaded.jsep.wasm",Qe.url).href,p=await(async function(m){var x=N;if(!f&&!z(x))try{var k=fetch(x,{credentials:"same-origin"});return await WebAssembly.instantiateStreaming(k,m)}catch(A){I(`wasm streaming compile failed: ${A}`),I("falling back to ArrayBuffer instantiation")}return(async function(A,M){try{var V=await(async function(G){if(!f)try{var oe=await o(G);return new Uint8Array(oe)}catch{}if(G==N&&f)G=new Uint8Array(f);else{if(!l)throw"both async and sync fetching of the wasm failed";G=l(G)}return G})(A);return await WebAssembly.instantiate(V,M)}catch(G){I(`failed to asynchronously prepare wasm: ${G}`),ve(G)}})(x,m)})(g),u(p.instance,p.module))}class Oe{name="ExitStatus";constructor(p){this.message=`Program terminated with exit(${p})`,this.status=p}}var _e=u=>{u.terminate(),u.onmessage=()=>{}},Te=[],Ne=0,kt=null,Br=u=>{ct.length==0&&(ms(),fs(ct[0]));var p=ct.pop();if(!p)return 6;lr.push(p),Ct[u.Rc]=p,p.Rc=u.Rc;var g={Sc:"run",Md:u.Ld,bd:u.bd,Rc:u.Rc};return p.postMessage(g,u.jd),0},pt=0,$e=(u,p,...g)=>{var m,x=16*g.length,k=le(),A=Zi(x),M=A>>>3;for(m of g)typeof m=="bigint"?(($(),X)[M++>>>0]=1n,($(),X)[M++>>>0]=m):(($(),X)[M++>>>0]=0n,($(),re)[M++>>>0]=m);return u=uo(u,0,x,A,p),ue(k),u};function Ai(u){if(n)return $e(0,1,u);if(_=u,!(0<pt)){for(var p of lr)_e(p);for(p of ct)_e(p);ct=[],lr=[],Ct={},C=!0}d(0,new Oe(u))}function ds(u){if(n)return $e(1,0,u);Ri(u)}var Ri=u=>{if(_=u,n)throw ds(u),"unwind";Ai(u)},ct=[],lr=[],ps=[],Ct={},cs=u=>{var p=u.Rc;delete Ct[p],ct.push(u),lr.splice(lr.indexOf(u),1),u.Rc=0,lo(p)};function hs(){ps.forEach(u=>u())}var fs=u=>new Promise(p=>{u.onmessage=x=>{var k=x.data;if(x=k.Sc,k.Zc&&k.Zc!=jr()){var A=Ct[k.Zc];A?A.postMessage(k,k.jd):I(`Internal error! Worker sent a message "${x}" to target pthread ${k.Zc}, but that thread no longer exists!`)}else x==="checkMailbox"?Wr():x==="spawnThread"?Br(k):x==="cleanupThread"?Ur(()=>{cs(Ct[k.Nd])}):x==="loaded"?(u.loaded=!0,p(u)):k.target==="setimmediate"?u.postMessage(k):x==="uncaughtException"?u.onerror(k.error):x==="callHandler"?t[k.vd](...k.args):x&&I(`worker sent an unknown command ${x}`)},u.onerror=x=>{throw I(`worker sent an error! ${x.filename}:${x.lineno}: ${x.message}`),x};var g,m=[];for(g of[])t.propertyIsEnumerable(g)&&m.push(g);u.postMessage({Sc:"load",xd:m,Od:ht,Pd:y})});function ms(){var u=new Worker((()=>{let p=URL;return Qe.url>"file:"&&Qe.url<"file;"?new p("ort.bundle.min.mjs",Qe.url):new URL(Qe.url)})(),{type:"module",workerData:"em-pthread",name:"em-pthread"});ct.push(u)}var ht,fg=(u,p)=>{pt=0,u=Qi(u,p),0<pt?_=u:Xi(u)},Nr=[],Pr=0;function mg(u){var p=new Di(u>>>=0);return($(),F)[p.Tc+12>>>0]==0&&(gs(p,!0),Pr--),_s(p,!1),Nr.push(p),go(u)}var Kt=0,gg=()=>{de(0,0);var u=Nr.pop();fo(u.cd),Kt=0};function gs(u,p){p=p?1:0,($(),F)[u.Tc+12>>>0]=p}function _s(u,p){p=p?1:0,($(),F)[u.Tc+13>>>0]=p}class Di{constructor(p){this.cd=p,this.Tc=p-24}}var Mi=u=>{var p=Kt;if(!p)return cr(0),0;var g=new Di(p);($(),U)[g.Tc+16>>>2>>>0]=p;var m=($(),U)[g.Tc+4>>>2>>>0];if(!m)return cr(0),p;for(var x of u){if(x===0||x===m)break;if(mo(x,m,g.Tc+16))return cr(x),p}return cr(m),p};function _g(){return Mi([])}function yg(u){return Mi([u>>>0])}function bg(u,p,g,m){return Mi([u>>>0,p>>>0,g>>>0,m>>>0])}var wg=()=>{var u=Nr.pop();u||ve("no exception to throw");var p=u.cd;throw($(),F)[u.Tc+13>>>0]==0&&(Nr.push(u),_s(u,!0),gs(u,!1),Pr++),Yi(p),Kt=p};function vg(u,p,g){var m=new Di(u>>>=0);throw p>>>=0,g>>>=0,($(),U)[m.Tc+16>>>2>>>0]=0,($(),U)[m.Tc+4>>>2>>>0]=p,($(),U)[m.Tc+8>>>2>>>0]=g,Yi(u),Pr++,Kt=u}var $g=()=>Pr;function ys(u,p,g,m){return n?$e(2,1,u,p,g,m):bs(u,p,g,m)}function bs(u,p,g,m){if(u>>>=0,p>>>=0,g>>>=0,m>>>=0,!globalThis.SharedArrayBuffer)return 6;var x=[];return n&&x.length===0?ys(u,p,g,m):(u={Ld:g,Rc:u,bd:m,jd:x},n?(u.Sc="spawnThread",postMessage(u,x),0):Br(u))}function xg(u){throw Kt||=u>>>0,Kt}var ws=globalThis.TextDecoder&&new TextDecoder,vs=(u,p,g,m)=>{if(g=p+g,m)return g;for(;u[p]&&!(p>=g);)++p;return p},$s=(u,p=0,g,m)=>{if(16<(g=vs(u,p>>>=0,g,m))-p&&u.buffer&&ws)return ws.decode(u.buffer instanceof ArrayBuffer?u.subarray(p,g):u.slice(p,g));for(m="";p<g;){var x=u[p++];if(128&x){var k=63&u[p++];if((224&x)==192)m+=String.fromCharCode((31&x)<<6|k);else{var A=63&u[p++];65536>(x=(240&x)==224?(15&x)<<12|k<<6|A:(7&x)<<18|k<<12|A<<6|63&u[p++])?m+=String.fromCharCode(x):(x-=65536,m+=String.fromCharCode(55296|x>>10,56320|1023&x))}}else m+=String.fromCharCode(x)}return m},ke=(u,p,g)=>(u>>>=0)?$s(($(),q),u,p,g):"";function xs(u,p,g){return n?$e(3,1,u,p,g):0}function Ss(u,p){if(n)return $e(4,1,u,p)}function Ts(u,p){if(n)return $e(5,1,u,p)}function Es(u,p,g){if(n)return $e(6,1,u,p,g)}function Is(u,p,g){return n?$e(7,1,u,p,g):0}function ks(u,p){if(n)return $e(8,1,u,p)}function Cs(u,p,g){if(n)return $e(9,1,u,p,g)}function zs(u,p,g,m){if(n)return $e(10,1,u,p,g,m)}function Os(u,p,g,m){if(n)return $e(11,1,u,p,g,m)}function As(u,p,g,m){if(n)return $e(12,1,u,p,g,m)}function Rs(u){if(n)return $e(13,1,u)}function Ds(u,p){if(n)return $e(14,1,u,p)}function Ms(u,p,g){if(n)return $e(15,1,u,p,g)}var Sg=()=>ve(""),tt=u=>{u>>>=0;for(var p="";;){var g=($(),q)[u++>>>0];if(!g)return p;p+=String.fromCharCode(g)}},Bi={},Ni={},Tg={},Xt=class extends Error{constructor(u){super(u),this.name="BindingError"}};function at(u,p,g={}){return(function(m,x,k={}){var A=x.name;if(!m)throw new Xt(`type "${A}" must have a positive integer typeid pointer`);if(Ni.hasOwnProperty(m)){if(k.yd)return;throw new Xt(`Cannot register type '${A}' twice`)}Ni[m]=x,delete Tg[m],Bi.hasOwnProperty(m)&&(x=Bi[m],delete Bi[m],x.forEach(M=>M()))})(u,p,g)}var Bs=(u,p,g)=>{switch(p){case 1:return g?m=>($(),F)[m>>>0]:m=>($(),q)[m>>>0];case 2:return g?m=>($(),P)[m>>>1>>>0]:m=>($(),K)[m>>>1>>>0];case 4:return g?m=>($(),O)[m>>>2>>>0]:m=>($(),U)[m>>>2>>>0];case 8:return g?m=>($(),X)[m>>>3>>>0]:m=>($(),se)[m>>>3>>>0];default:throw new TypeError(`invalid integer width (${p}): ${u}`)}};function Eg(u,p,g,m,x){u>>>=0,g>>>=0,p=tt(p>>>0);let k=A=>A;if(m=m===0n){let A=8*g;k=M=>BigInt.asUintN(A,M),x=k(x)}at(u,{name:p,Oc:k,Vc:(A,M)=>(typeof M=="number"&&(M=BigInt(M)),M),Uc:Bs(p,g,!m),Wc:null})}function Ig(u,p,g,m){at(u>>>=0,{name:p=tt(p>>>0),Oc:function(x){return!!x},Vc:function(x,k){return k?g:m},Uc:function(x){return this.Oc(($(),q)[x>>>0])},Wc:null})}var Ns=[],zt=[0,1,,1,null,1,!0,1,!1,1];function Pi(u){9<(u>>>=0)&&--zt[u+1]===0&&(zt[u]=void 0,Ns.push(u))}var We=u=>{if(!u)throw new Xt(`Cannot use deleted val. handle = ${u}`);return zt[u]},Fe=u=>{switch(u){case void 0:return 2;case null:return 4;case!0:return 6;case!1:return 8;default:let p=Ns.pop()||zt.length;return zt[p]=u,zt[p+1]=1,p}};function Li(u){return this.Oc(($(),U)[u>>>2>>>0])}var kg={name:"emscripten::val",Oc:u=>{var p=We(u);return Pi(u),p},Vc:(u,p)=>Fe(p),Uc:Li,Wc:null};function Cg(u){return at(u>>>0,kg)}var zg=(u,p)=>{switch(p){case 4:return function(g){return this.Oc(($(),J)[g>>>2>>>0])};case 8:return function(g){return this.Oc(($(),re)[g>>>3>>>0])};default:throw new TypeError(`invalid float width (${p}): ${u}`)}};function Og(u,p,g){g>>>=0,at(u>>>=0,{name:p=tt(p>>>0),Oc:m=>m,Vc:(m,x)=>x,Uc:zg(p,g),Wc:null})}function Ag(u,p,g,m,x){u>>>=0,g>>>=0,p=tt(p>>>0);let k=M=>M;if(m===0){var A=32-8*g;k=M=>M<<A>>>A,x=k(x)}at(u,{name:p,Oc:k,Vc:(M,V)=>V,Uc:Bs(p,g,m!==0),Wc:null})}function Rg(u,p,g){function m(k){var A=($(),U)[k>>>2>>>0];return k=($(),U)[k+4>>>2>>>0],new x(($(),F).buffer,k,A)}var x=[Int8Array,Uint8Array,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array][p];at(u>>>=0,{name:g=tt(g>>>0),Oc:m,Uc:m},{yd:!0})}var ft=(u,p,g)=>{var m=($(),q);if(p>>>=0,0<g){var x=p;g=p+g-1;for(var k=0;k<u.length;++k){var A=u.codePointAt(k);if(127>=A){if(p>=g)break;m[p++>>>0]=A}else if(2047>=A){if(p+1>=g)break;m[p++>>>0]=192|A>>6,m[p++>>>0]=128|63&A}else if(65535>=A){if(p+2>=g)break;m[p++>>>0]=224|A>>12,m[p++>>>0]=128|A>>6&63,m[p++>>>0]=128|63&A}else{if(p+3>=g)break;m[p++>>>0]=240|A>>18,m[p++>>>0]=128|A>>12&63,m[p++>>>0]=128|A>>6&63,m[p++>>>0]=128|63&A,k++}}m[p>>>0]=0,u=p-x}else u=0;return u},Lr=u=>{for(var p=0,g=0;g<u.length;++g){var m=u.charCodeAt(g);127>=m?p++:2047>=m?p+=2:55296<=m&&57343>=m?(p+=4,++g):p+=3}return p};function Dg(u,p){at(u>>>=0,{name:p=tt(p>>>0),Oc(g){var m=($(),U)[g>>>2>>>0];return m=ke(g+4,m,!0),it(g),m},Vc(g,m){m instanceof ArrayBuffer&&(m=new Uint8Array(m));var x=typeof m=="string";if(!(x||ArrayBuffer.isView(m)&&m.BYTES_PER_ELEMENT==1))throw new Xt("Cannot pass non-string to std::string");var k=x?Lr(m):m.length,A=pr(4+k+1),M=A+4;return($(),U)[A>>>2>>>0]=k,x?ft(m,M,k+1):($(),q).set(m,M>>>0),g!==null&&g.push(it,A),A},Uc:Li,Wc(g){it(g)}})}var Ps=globalThis.TextDecoder?new TextDecoder("utf-16le"):void 0,Mg=(u,p,g)=>{if(u>>>=1,16<(p=vs(($(),K),u,p/2,g))-u&&Ps)return Ps.decode(($(),K).slice(u,p));for(g="";u<p;++u){var m=($(),K)[u>>>0];g+=String.fromCharCode(m)}return g},Bg=(u,p,g)=>{if(g??=2147483647,2>g)return 0;var m=p;g=(g-=2)<2*u.length?g/2:u.length;for(var x=0;x<g;++x){var k=u.charCodeAt(x);($(),P)[p>>>1>>>0]=k,p+=2}return($(),P)[p>>>1>>>0]=0,p-m},Ng=u=>2*u.length,Pg=(u,p,g)=>{var m="";u>>>=2;for(var x=0;!(x>=p/4);x++){var k=($(),U)[u+x>>>0];if(!k&&!g)break;m+=String.fromCodePoint(k)}return m},Lg=(u,p,g)=>{if(p>>>=0,g??=2147483647,4>g)return 0;var m=p;g=m+g-4;for(var x=0;x<u.length;++x){var k=u.codePointAt(x);if(65535<k&&x++,($(),O)[p>>>2>>>0]=k,(p+=4)+4>g)break}return($(),O)[p>>>2>>>0]=0,p-m},Ug=u=>{for(var p=0,g=0;g<u.length;++g)65535<u.codePointAt(g)&&g++,p+=4;return p};function Wg(u,p,g){if(u>>>=0,p>>>=0,g=tt(g>>>=0),p===2)var m=Mg,x=Bg,k=Ng;else m=Pg,x=Lg,k=Ug;at(u,{name:g,Oc:A=>{var M=($(),U)[A>>>2>>>0];return M=m(A+4,M*p,!0),it(A),M},Vc:(A,M)=>{if(typeof M!="string")throw new Xt(`Cannot pass non-string to C++ string type ${g}`);var V=k(M),G=pr(4+V+p);return($(),U)[G>>>2>>>0]=V/p,x(M,G+4,V+p),A!==null&&A.push(it,G),G},Uc:Li,Wc(A){it(A)}})}function qg(u,p){at(u>>>=0,{zd:!0,name:p=tt(p>>>0),Oc:()=>{},Vc:()=>{}})}function Vg(u){Ki(u>>>0,!i,1,!r,131072,!1),hs()}var Ur=u=>{if(!C)try{if(u(),!(0<pt))try{n?jr()&&Xi(_):Ri(_)}catch(p){p instanceof Oe||p=="unwind"||d(0,p)}}catch(p){p instanceof Oe||p=="unwind"||d(0,p)}},Gg=!Atomics.waitAsync||globalThis.navigator?.userAgent&&91>Number((navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./)||[])[2]);function Ui(u){u>>>=0,Gg||(Atomics.waitAsync(($(),O),u>>>2,u).value.then(Wr),u+=128,Atomics.store(($(),O),u>>>2,1))}var Wr=()=>Ur(()=>{var u=jr();u&&(Ui(u),co())});function Fg(u,p){(u>>>=0)==p>>>0?setTimeout(Wr):n?postMessage({Zc:u,Sc:"checkMailbox"}):(u=Ct[u])&&u.postMessage({Sc:"checkMailbox"})}var Wi=[];function Hg(u,p,g,m,x){for(p>>>=0,x>>>=0,Wi.length=0,g=x>>>3,m=x+m>>>3;g<m;){var k;k=($(),X)[g++>>>0]?($(),X)[g++>>>0]:($(),re)[g++>>>0],Wi.push(k)}return(p?Ji[p]:N0[u])(...Wi)}var jg=()=>{pt=0};function Kg(u){u>>>=0,n?postMessage({Sc:"cleanupThread",Nd:u}):cs(Ct[u])}function Xg(u){}var qr=u=>{try{u()}catch(p){ve(p)}};function Zg(u){var p=(...g)=>{Vr.push(u);try{return u(...g)}finally{C||(Vr.pop(),rt&&mt===1&&Vr.length===0&&(mt=0,pt+=1,qr(eu),typeof Fibers<"u"&&Fibers.be()))}};return Ws.set(u,p),p}var mt=0,rt=null,Ls=0,Vr=[],qi=new Map,Us=new Map,Ws=new Map,Yg=0,Vi=null,Qg=[],qs=u=>(function(p){if(!C){if(mt===0){var g=!1,m=!1;p((x=0)=>{if(!C&&(Ls=x,g=!0,m)){mt=2,qr(()=>tu(rt)),typeof MainLoop<"u"&&MainLoop.ud&&MainLoop.resume(),x=!1;try{var k=(function(){var V=($(),O)[rt+8>>>2>>>0];return V=Us.get(V),V=Ws.get(V),--pt,V()})()}catch(V){k=V,x=!0}var A=!1;if(!rt){var M=Vi;M&&(Vi=null,(x?M.reject:M.resolve)(k),A=!0)}if(x&&!A)throw k}}),m=!0,g||(mt=1,rt=(function(){var x=pr(65548),k=x+12;if(($(),U)[x>>>2>>>0]=k,($(),U)[x+4>>>2>>>0]=k+65536,k=Vr[0],!qi.has(k)){var A=Yg++;qi.set(k,A),Us.set(A,k)}return k=qi.get(k),($(),O)[x+8>>>2>>>0]=k,x})(),typeof MainLoop<"u"&&MainLoop.ud&&MainLoop.pause(),qr(()=>Jo(rt)))}else mt===2?(mt=0,qr(ru),it(rt),rt=null,Qg.forEach(Ur)):ve(`invalid state: ${mt}`);return Ls}})(p=>{u().then(p)});function Jg(u){return u>>>=0,qs(async()=>{var p=await We(u);return Fe(p)})}var Gi=[],e0=u=>{var p=Gi.length;return Gi.push(u),p},t0=(u,p)=>{for(var g=Array(u),m=0;m<u;++m){var x=m,k=($(),U)[p+4*m>>>2>>>0],A=Ni[k];if(A===void 0)throw u=`parameter ${m}`,k=ao(k),p=tt(k),it(k),new Xt(`${u} has unknown type ${p}`);g[x]=A}return g},r0=(u,p,g)=>{var m=[];return u=u(m,g),m.length&&(($(),U)[p>>>2>>>0]=Fe(m)),u},i0={},Gr=u=>{var p=i0[u];return p===void 0?tt(u):p};function n0(u,p,g){var[m,...x]=t0(u,p>>>0);p=m.Vc.bind(m);var k=x.map(V=>V.Uc.bind(V));u--;var A={toValue:We};switch(u=k.map((V,G)=>{var oe=`argFromPtr${G}`;return A[oe]=V,`${oe}(args${G?"+"+8*G:""})`}),g){case 0:var M="toValue(handle)";break;case 2:M="new (toValue(handle))";break;case 3:M="";break;case 1:A.getStringOrSymbol=Gr,M="toValue(handle)[getStringOrSymbol(methodName)]"}return M+=`(${u})`,m.zd||(A.toReturnWire=p,A.emval_returnValue=r0,M=`return emval_returnValue(toReturnWire, destructorsRef, ${M})`),M=`return function (handle, methodName, destructorsRef, args) {
  ${M}
  }`,g=new Function(Object.keys(A),M)(...Object.values(A)),M=`methodCaller<(${x.map(V=>V.name)}) => ${m.name}>`,e0(Object.defineProperty(g,"name",{value:M}))}function a0(u,p){return p>>>=0,(u=We(u>>>0))==We(p)}function s0(u){return(u>>>=0)?(u=Gr(u),Fe(globalThis[u])):Fe(globalThis)}function o0(u){return u=Gr(u>>>0),Fe(t[u])}function u0(u,p){return p>>>=0,u=We(u>>>0),p=We(p),Fe(u[p])}function l0(u){9<(u>>>=0)&&(zt[u+1]+=1)}function Vs(u,p,g,m,x){return Gi[u>>>0](p>>>0,g>>>0,m>>>0,x>>>0)}function d0(u,p,g,m,x){return Vs(u>>>0,p>>>0,g>>>0,m>>>0,x>>>0)}function p0(){return Fe([])}function c0(u){u=We(u>>>0);for(var p=Array(u.length),g=0;g<u.length;g++)p[g]=u[g];return Fe(p)}function h0(u){return Fe(Gr(u>>>0))}function f0(){return Fe({})}function m0(u){for(var p=We(u>>>=0);p.length;){var g=p.pop();p.pop()(g)}Pi(u)}function g0(u,p,g){p>>>=0,g>>>=0,u=We(u>>>0),p=We(p),g=We(g),u[p]=g}function _0(u,p){u=-9007199254740992>u||9007199254740992<u?NaN:Number(u),p>>>=0,u=new Date(1e3*u),($(),O)[p>>>2>>>0]=u.getUTCSeconds(),($(),O)[p+4>>>2>>>0]=u.getUTCMinutes(),($(),O)[p+8>>>2>>>0]=u.getUTCHours(),($(),O)[p+12>>>2>>>0]=u.getUTCDate(),($(),O)[p+16>>>2>>>0]=u.getUTCMonth(),($(),O)[p+20>>>2>>>0]=u.getUTCFullYear()-1900,($(),O)[p+24>>>2>>>0]=u.getUTCDay(),u=(u.getTime()-Date.UTC(u.getUTCFullYear(),0,1,0,0,0,0))/864e5|0,($(),O)[p+28>>>2>>>0]=u}var Gs=u=>u%4==0&&(u%100!=0||u%400==0),Fs=[0,31,60,91,121,152,182,213,244,274,305,335],Hs=[0,31,59,90,120,151,181,212,243,273,304,334];function y0(u,p){u=-9007199254740992>u||9007199254740992<u?NaN:Number(u),p>>>=0,u=new Date(1e3*u),($(),O)[p>>>2>>>0]=u.getSeconds(),($(),O)[p+4>>>2>>>0]=u.getMinutes(),($(),O)[p+8>>>2>>>0]=u.getHours(),($(),O)[p+12>>>2>>>0]=u.getDate(),($(),O)[p+16>>>2>>>0]=u.getMonth(),($(),O)[p+20>>>2>>>0]=u.getFullYear()-1900,($(),O)[p+24>>>2>>>0]=u.getDay();var g=(Gs(u.getFullYear())?Fs:Hs)[u.getMonth()]+u.getDate()-1|0;($(),O)[p+28>>>2>>>0]=g,($(),O)[p+36>>>2>>>0]=-60*u.getTimezoneOffset(),g=new Date(u.getFullYear(),6,1).getTimezoneOffset();var m=new Date(u.getFullYear(),0,1).getTimezoneOffset();u=0|(g!=m&&u.getTimezoneOffset()==Math.min(m,g)),($(),O)[p+32>>>2>>>0]=u}function b0(u){u>>>=0;var p=new Date(($(),O)[u+20>>>2>>>0]+1900,($(),O)[u+16>>>2>>>0],($(),O)[u+12>>>2>>>0],($(),O)[u+8>>>2>>>0],($(),O)[u+4>>>2>>>0],($(),O)[u>>>2>>>0],0),g=($(),O)[u+32>>>2>>>0],m=p.getTimezoneOffset(),x=new Date(p.getFullYear(),6,1).getTimezoneOffset(),k=new Date(p.getFullYear(),0,1).getTimezoneOffset(),A=Math.min(k,x);return 0>g?($(),O)[u+32>>>2>>>0]=+(x!=k&&A==m):0<g!=(A==m)&&(x=Math.max(k,x),p.setTime(p.getTime()+6e4*((0<g?A:x)-m))),($(),O)[u+24>>>2>>>0]=p.getDay(),g=(Gs(p.getFullYear())?Fs:Hs)[p.getMonth()]+p.getDate()-1|0,($(),O)[u+28>>>2>>>0]=g,($(),O)[u>>>2>>>0]=p.getSeconds(),($(),O)[u+4>>>2>>>0]=p.getMinutes(),($(),O)[u+8>>>2>>>0]=p.getHours(),($(),O)[u+12>>>2>>>0]=p.getDate(),($(),O)[u+16>>>2>>>0]=p.getMonth(),($(),O)[u+20>>>2>>>0]=p.getYear(),u=p.getTime(),BigInt(isNaN(u)?-1:u/1e3)}function js(u,p,g,m,x,k,A){return n?$e(16,1,u,p,g,m,x,k,A):-52}function Ks(u,p,g,m,x,k){if(n)return $e(17,1,u,p,g,m,x,k)}var dr={},w0=()=>performance.timeOrigin+performance.now();function Xs(u,p){if(n)return $e(18,1,u,p);if(dr[u]&&(clearTimeout(dr[u].id),delete dr[u]),!p)return 0;var g=setTimeout(()=>{delete dr[u],Ur(()=>po(u,performance.timeOrigin+performance.now()))},p);return dr[u]={id:g,ae:p},0}function v0(u,p,g,m){u>>>=0,p>>>=0,g>>>=0,m>>>=0;var x=new Date().getFullYear(),k=new Date(x,0,1).getTimezoneOffset();x=new Date(x,6,1).getTimezoneOffset();var A=Math.max(k,x);($(),U)[u>>>2>>>0]=60*A,($(),O)[p>>>2>>>0]=+(k!=x),u=(p=M=>{var V=Math.abs(M);return`UTC${0<=M?"-":"+"}${String(Math.floor(V/60)).padStart(2,"0")}${String(V%60).padStart(2,"0")}`})(k),p=p(x),x<k?(ft(u,g,17),ft(p,m,17)):(ft(u,m,17),ft(p,g,17))}var $0=()=>Date.now(),x0=1;function S0(u,p,g){if(g>>>=0,!(0<=u&&3>=u))return 28;if(u===0)u=Date.now();else{if(!x0)return 52;u=performance.timeOrigin+performance.now()}return u=Math.round(1e6*u),($(),X)[g>>>3>>>0]=BigInt(u),0}var Fi=[],Zs=(u,p)=>{Fi.length=0;for(var g;g=($(),q)[u++>>>0];){var m=g!=105;p+=(m&=g!=112)&&p%8?4:0,Fi.push(g==112?($(),U)[p>>>2>>>0]:g==106?($(),X)[p>>>3>>>0]:g==105?($(),O)[p>>>2>>>0]:($(),re)[p>>>3>>>0]),p+=m?8:4}return Fi};function T0(u,p,g){return u>>>=0,p=Zs(p>>>0,g>>>0),Ji[u](...p)}function E0(u,p,g){return u>>>=0,p=Zs(p>>>0,g>>>0),Ji[u](...p)}var I0=()=>{};function k0(u,p){return I(ke(u>>>0,p>>>0))}var C0=()=>{throw pt+=1,"unwind"};function z0(){return 4294901760}var O0=()=>navigator.hardwareConcurrency,Ot={},Fr=u=>{var p;return(p=/\bwasm-function\[\d+\]:(0x[0-9a-f]+)/.exec(u))?+p[1]:(p=/:(\d+):\d+(?:\)|$)/.exec(u))?2147483648|+p[1]:0},Ys=u=>{for(var p of u)(u=Fr(p))&&(Ot[u]=p)};function A0(){var u=Error().stack.toString().split(`
`);return u[0]=="Error"&&u.shift(),Ys(u),Ot.gd=Fr(u[3]),Ot.Jd=u,Ot.gd}function Hr(u){if(!(u=Ot[u>>>0]))return 0;var p;if(p=/^\s+at .*\.wasm\.(.*) \(.*\)$/.exec(u))u=p[1];else if(p=/^\s+at (.*) \(.*\)$/.exec(u))u=p[1];else{if(!(p=/^(.+?)@/.exec(u)))return 0;u=p[1]}it(Hr.hd??0),p=Lr(u)+1;var g=pr(p);return g&&ft(u,g,p),Hr.hd=g,Hr.hd}function R0(u){u>>>=0;var p=($(),q).length;if(u<=p||4294901760<u)return!1;for(var g=1;4>=g;g*=2){var m=p*(1+.2/g);m=Math.min(m,u+100663296);e:{m=(Math.min(4294901760,65536*Math.ceil(Math.max(u,m)/65536))-ht.buffer.byteLength+65535)/65536|0;try{ht.grow(m),Y();var x=1;break e}catch{}x=void 0}if(x)return!0}return!1}function D0(u,p,g){if(u>>>=0,p>>>=0,Ot.gd==u)var m=Ot.Jd;else(m=Error().stack.toString().split(`
`))[0]=="Error"&&m.shift(),Ys(m);for(var x=3;m[x]&&Fr(m[x])!=u;)++x;for(u=0;u<g&&m[u+x];++u)($(),O)[p+4*u>>>2>>>0]=Fr(m[u+x]);return u}var Hi,ji={},Qs=()=>{if(!Hi){var u,p={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:(globalThis.navigator?.language??"C").replace("-","_")+".UTF-8",_:"./this.program"};for(u in ji)ji[u]===void 0?delete p[u]:p[u]=ji[u];var g=[];for(u in p)g.push(`${u}=${p[u]}`);Hi=g}return Hi};function Js(u,p){if(n)return $e(19,1,u,p);u>>>=0,p>>>=0;var g,m=0,x=0;for(g of Qs()){var k=p+m;($(),U)[u+x>>>2>>>0]=k,m+=ft(g,k,1/0)+1,x+=4}return 0}function eo(u,p){if(n)return $e(20,1,u,p);u>>>=0,p>>>=0;var g=Qs();for(var m of(($(),U)[u>>>2>>>0]=g.length,u=0,g))u+=Lr(m)+1;return($(),U)[p>>>2>>>0]=u,0}function to(u){return n?$e(21,1,u):52}function ro(u,p,g,m){return n?$e(22,1,u,p,g,m):52}function io(u,p,g,m){return n?$e(23,1,u,p,g,m):70}var M0=[null,[],[]];function no(u,p,g,m){if(n)return $e(24,1,u,p,g,m);p>>>=0,g>>>=0,m>>>=0;for(var x=0,k=0;k<g;k++){var A=($(),U)[p>>>2>>>0],M=($(),U)[p+4>>>2>>>0];p+=8;for(var V=0;V<M;V++){var G=u,oe=($(),q)[A+V>>>0],ce=M0[G];oe===0||oe===10?((G===1?E:I)($s(ce)),ce.length=0):ce.push(oe)}x+=M}return($(),U)[m>>>2>>>0]=x,0}function B0(u){return u>>>0}n||(function(){for(var u=t.numThreads-1;u--;)ms();Te.push(async()=>{var p=(async function(){if(!n)return Promise.all(ct.map(fs))})();Ne++,await p,--Ne==0&&kt&&(p=kt,kt=null,p())})})(),n||(ht=new WebAssembly.Memory({initial:256,maximum:65536,shared:!0}),Y()),t.wasmBinary&&(f=t.wasmBinary),t.stackSave=()=>le(),t.stackRestore=u=>ue(u),t.stackAlloc=u=>Zi(u),t.setValue=function(u,p,g="i8"){switch(g.endsWith("*")&&(g="*"),g){case"i1":case"i8":($(),F)[u>>>0]=p;break;case"i16":($(),P)[u>>>1>>>0]=p;break;case"i32":($(),O)[u>>>2>>>0]=p;break;case"i64":($(),X)[u>>>3>>>0]=BigInt(p);break;case"float":($(),J)[u>>>2>>>0]=p;break;case"double":($(),re)[u>>>3>>>0]=p;break;case"*":($(),U)[u>>>2>>>0]=p;break;default:ve(`invalid type for setValue: ${g}`)}},t.getValue=function(u,p="i8"){switch(p.endsWith("*")&&(p="*"),p){case"i1":case"i8":return($(),F)[u>>>0];case"i16":return($(),P)[u>>>1>>>0];case"i32":return($(),O)[u>>>2>>>0];case"i64":return($(),X)[u>>>3>>>0];case"float":return($(),J)[u>>>2>>>0];case"double":return($(),re)[u>>>3>>>0];case"*":return($(),U)[u>>>2>>>0];default:ve(`invalid type for getValue: ${p}`)}},t.UTF8ToString=ke,t.stringToUTF8=ft,t.lengthBytesUTF8=Lr;var ao,so,jr,it,pr,Ki,oo,uo,lo,Xi,po,co,de,cr,ho,ue,Zi,le,fo,Yi,mo,go,_o,Qi,yo,bo,wo,vo,$o,xo,So,To,Eo,Io,ko,Co,zo,Oo,Ao,Ro,Do,Mo,Bo,No,Po,Lo,Uo,Wo,qo,Vo,Go,Fo,Ho,jo,Ko,Xo,Zo,Yo,Qo,Jo,eu,tu,ru,st,N0=[Ai,ds,ys,xs,Ss,Ts,Es,Is,ks,Cs,zs,Os,As,Rs,Ds,Ms,js,Ks,Xs,Js,eo,to,ro,io,no],Ji={1055492:(u,p,g,m,x)=>{if(t===void 0||!t.Yc)return 1;if((u=ke(Number(u>>>0))).startsWith("./")&&(u=u.substring(2)),!(u=t.Yc.get(u)))return 2;if(p=Number(p>>>0),g=Number(g>>>0),m=Number(m>>>0),p+g>u.byteLength)return 3;try{let k=u.subarray(p,p+g);switch(x){case 0:($(),q).set(k,m>>>0);break;case 1:t.Qd?t.Qd(m,k):t.Id(m,k);break;default:return 4}return 0}catch{return 4}},1056316:(u,p,g)=>{t.td(u,($(),q).subarray(p>>>0,p+g>>>0))},1056380:()=>t.Sd(),1056422:u=>{t.sd(u)},1056459:()=>{t.Bd()},1056490:()=>{t.Cd()},1056519:()=>{t.Gd()},1056544:u=>t.Ad(u),1056577:u=>t.Ed(u),1056609:(u,p,g)=>{t.ed(Number(u),Number(p),Number(g),!0)},1056672:(u,p,g)=>{t.ed(Number(u),Number(p),Number(g))},1056729:()=>typeof wasmOffsetConverter<"u",1056786:u=>{t.$b("Abs",u,void 0)},1056837:u=>{t.$b("Neg",u,void 0)},1056888:u=>{t.$b("Floor",u,void 0)},1056941:u=>{t.$b("Ceil",u,void 0)},1056993:u=>{t.$b("Reciprocal",u,void 0)},1057051:u=>{t.$b("Sqrt",u,void 0)},1057103:u=>{t.$b("Exp",u,void 0)},1057154:u=>{t.$b("Erf",u,void 0)},1057205:u=>{t.$b("Sigmoid",u,void 0)},1057260:(u,p,g)=>{t.$b("HardSigmoid",u,{alpha:p,beta:g})},1057339:u=>{t.$b("HardSwish",u,void 0)},1057396:u=>{t.$b("Log",u,void 0)},1057447:u=>{t.$b("Sin",u,void 0)},1057498:u=>{t.$b("Cos",u,void 0)},1057549:u=>{t.$b("Tan",u,void 0)},1057600:u=>{t.$b("Asin",u,void 0)},1057652:u=>{t.$b("Acos",u,void 0)},1057704:u=>{t.$b("Atan",u,void 0)},1057756:u=>{t.$b("Sinh",u,void 0)},1057808:u=>{t.$b("Cosh",u,void 0)},1057860:u=>{t.$b("Asinh",u,void 0)},1057913:u=>{t.$b("Acosh",u,void 0)},1057966:u=>{t.$b("Atanh",u,void 0)},1058019:u=>{t.$b("Tanh",u,void 0)},1058071:u=>{t.$b("Not",u,void 0)},1058122:(u,p,g)=>{t.$b("Clip",u,{min:p,max:g})},1058191:u=>{t.$b("Clip",u,void 0)},1058243:(u,p)=>{t.$b("Elu",u,{alpha:p})},1058301:u=>{t.$b("Gelu",u,void 0)},1058353:u=>{t.$b("Relu",u,void 0)},1058405:(u,p)=>{t.$b("LeakyRelu",u,{alpha:p})},1058469:(u,p)=>{t.$b("ThresholdedRelu",u,{alpha:p})},1058539:(u,p)=>{t.$b("Cast",u,{to:p})},1058597:u=>{t.$b("Add",u,void 0)},1058648:u=>{t.$b("Sub",u,void 0)},1058699:u=>{t.$b("Mul",u,void 0)},1058750:u=>{t.$b("Div",u,void 0)},1058801:u=>{t.$b("Pow",u,void 0)},1058852:u=>{t.$b("Equal",u,void 0)},1058905:u=>{t.$b("Greater",u,void 0)},1058960:u=>{t.$b("GreaterOrEqual",u,void 0)},1059022:u=>{t.$b("Less",u,void 0)},1059074:u=>{t.$b("LessOrEqual",u,void 0)},1059133:(u,p,g,m,x)=>{t.$b("ReduceMean",u,{keepDims:!!p,noopWithEmptyAxes:!!g,axes:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[]})},1059308:(u,p,g,m,x)=>{t.$b("ReduceMax",u,{keepDims:!!p,noopWithEmptyAxes:!!g,axes:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[]})},1059482:(u,p,g,m,x)=>{t.$b("ReduceMin",u,{keepDims:!!p,noopWithEmptyAxes:!!g,axes:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[]})},1059656:(u,p,g,m,x)=>{t.$b("ReduceProd",u,{keepDims:!!p,noopWithEmptyAxes:!!g,axes:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[]})},1059831:(u,p,g,m,x)=>{t.$b("ReduceSum",u,{keepDims:!!p,noopWithEmptyAxes:!!g,axes:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[]})},1060005:(u,p,g,m,x)=>{t.$b("ReduceL1",u,{keepDims:!!p,noopWithEmptyAxes:!!g,axes:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[]})},1060178:(u,p,g,m,x)=>{t.$b("ReduceL2",u,{keepDims:!!p,noopWithEmptyAxes:!!g,axes:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[]})},1060351:(u,p,g,m,x)=>{t.$b("ReduceLogSum",u,{keepDims:!!p,noopWithEmptyAxes:!!g,axes:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[]})},1060528:(u,p,g,m,x)=>{t.$b("ReduceSumSquare",u,{keepDims:!!p,noopWithEmptyAxes:!!g,axes:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[]})},1060708:(u,p,g,m,x)=>{t.$b("ReduceLogSumExp",u,{keepDims:!!p,noopWithEmptyAxes:!!g,axes:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[]})},1060888:u=>{t.$b("Where",u,void 0)},1060941:(u,p,g)=>{t.$b("Transpose",u,{perm:p?Array.from(($(),O).subarray(Number(p)>>>0,Number(g)>>>0)):[]})},1061065:(u,p,g,m)=>{t.$b("DepthToSpace",u,{blocksize:p,mode:ke(g),format:m?"NHWC":"NCHW"})},1061198:(u,p,g,m)=>{t.$b("DepthToSpace",u,{blocksize:p,mode:ke(g),format:m?"NHWC":"NCHW"})},1061331:(u,p,g,m)=>{t.$b("DFT",u,{axis:p,inverse:g,onesided:m})},1061423:(u,p,g,m,x,k,A,M,V,G,oe,ce,ye,we,gt)=>{t.$b("ConvTranspose",u,{format:V?"NHWC":"NCHW",autoPad:p,dilations:[g],group:m,kernelShape:[x],pads:[k,A],strides:[M],wIsConst:()=>!!($(),F)[G>>>0],outputPadding:oe?Array.from(($(),O).subarray(Number(oe)>>>0,Number(ce)>>>0)):[],outputShape:ye?Array.from(($(),O).subarray(Number(ye)>>>0,Number(we)>>>0)):[],activation:ke(gt)})},1061856:(u,p,g,m,x,k,A,M,V,G,oe,ce,ye,we)=>{t.$b("ConvTranspose",u,{format:M?"NHWC":"NCHW",autoPad:p,dilations:Array.from(($(),O).subarray(Number(g)>>>0,(Number(g)>>>0)+2>>>0)),group:m,kernelShape:Array.from(($(),O).subarray(Number(x)>>>0,(Number(x)>>>0)+2>>>0)),pads:Array.from(($(),O).subarray(Number(k)>>>0,(Number(k)>>>0)+4>>>0)),strides:Array.from(($(),O).subarray(Number(A)>>>0,(Number(A)>>>0)+2>>>0)),wIsConst:()=>!!($(),F)[V>>>0],outputPadding:G?Array.from(($(),O).subarray(Number(G)>>>0,Number(oe)>>>0)):[],outputShape:ce?Array.from(($(),O).subarray(Number(ce)>>>0,Number(ye)>>>0)):[],activation:ke(we)})},1062517:(u,p,g,m,x,k,A,M,V,G,oe,ce,ye,we,gt)=>{t.$b("ConvTranspose",u,{format:V?"NHWC":"NCHW",autoPad:p,dilations:[g],group:m,kernelShape:[x],pads:[k,A],strides:[M],wIsConst:()=>!!($(),F)[G>>>0],outputPadding:oe?Array.from(($(),O).subarray(Number(oe)>>>0,Number(ce)>>>0)):[],outputShape:ye?Array.from(($(),O).subarray(Number(ye)>>>0,Number(we)>>>0)):[],activation:ke(gt)})},1062950:(u,p,g,m,x,k,A,M,V,G,oe,ce,ye,we)=>{t.$b("ConvTranspose",u,{format:M?"NHWC":"NCHW",autoPad:p,dilations:Array.from(($(),O).subarray(Number(g)>>>0,(Number(g)>>>0)+2>>>0)),group:m,kernelShape:Array.from(($(),O).subarray(Number(x)>>>0,(Number(x)>>>0)+2>>>0)),pads:Array.from(($(),O).subarray(Number(k)>>>0,(Number(k)>>>0)+4>>>0)),strides:Array.from(($(),O).subarray(Number(A)>>>0,(Number(A)>>>0)+2>>>0)),wIsConst:()=>!!($(),F)[V>>>0],outputPadding:G?Array.from(($(),O).subarray(Number(G)>>>0,Number(oe)>>>0)):[],outputShape:ce?Array.from(($(),O).subarray(Number(ce)>>>0,Number(ye)>>>0)):[],activation:ke(we)})},1063611:(u,p)=>{t.$b("GlobalAveragePool",u,{format:p?"NHWC":"NCHW"})},1063702:(u,p,g,m,x,k,A,M,V,G,oe,ce,ye,we)=>{t.$b("AveragePool",u,{format:we?"NHWC":"NCHW",auto_pad:p,ceil_mode:g,count_include_pad:m,storage_order:x,dilations:k?Array.from(($(),O).subarray(Number(k)>>>0,Number(A)>>>0)):[],kernel_shape:M?Array.from(($(),O).subarray(Number(M)>>>0,Number(V)>>>0)):[],pads:G?Array.from(($(),O).subarray(Number(G)>>>0,Number(oe)>>>0)):[],strides:ce?Array.from(($(),O).subarray(Number(ce)>>>0,Number(ye)>>>0)):[]})},1064181:(u,p)=>{t.$b("GlobalAveragePool",u,{format:p?"NHWC":"NCHW"})},1064272:(u,p,g,m,x,k,A,M,V,G,oe,ce,ye,we)=>{t.$b("AveragePool",u,{format:we?"NHWC":"NCHW",auto_pad:p,ceil_mode:g,count_include_pad:m,storage_order:x,dilations:k?Array.from(($(),O).subarray(Number(k)>>>0,Number(A)>>>0)):[],kernel_shape:M?Array.from(($(),O).subarray(Number(M)>>>0,Number(V)>>>0)):[],pads:G?Array.from(($(),O).subarray(Number(G)>>>0,Number(oe)>>>0)):[],strides:ce?Array.from(($(),O).subarray(Number(ce)>>>0,Number(ye)>>>0)):[]})},1064751:(u,p)=>{t.$b("GlobalMaxPool",u,{format:p?"NHWC":"NCHW"})},1064838:(u,p,g,m,x,k,A,M,V,G,oe,ce,ye,we)=>{t.$b("MaxPool",u,{format:we?"NHWC":"NCHW",auto_pad:p,ceil_mode:g,count_include_pad:m,storage_order:x,dilations:k?Array.from(($(),O).subarray(Number(k)>>>0,Number(A)>>>0)):[],kernel_shape:M?Array.from(($(),O).subarray(Number(M)>>>0,Number(V)>>>0)):[],pads:G?Array.from(($(),O).subarray(Number(G)>>>0,Number(oe)>>>0)):[],strides:ce?Array.from(($(),O).subarray(Number(ce)>>>0,Number(ye)>>>0)):[]})},1065313:(u,p)=>{t.$b("GlobalMaxPool",u,{format:p?"NHWC":"NCHW"})},1065400:(u,p,g,m,x,k,A,M,V,G,oe,ce,ye,we)=>{t.$b("MaxPool",u,{format:we?"NHWC":"NCHW",auto_pad:p,ceil_mode:g,count_include_pad:m,storage_order:x,dilations:k?Array.from(($(),O).subarray(Number(k)>>>0,Number(A)>>>0)):[],kernel_shape:M?Array.from(($(),O).subarray(Number(M)>>>0,Number(V)>>>0)):[],pads:G?Array.from(($(),O).subarray(Number(G)>>>0,Number(oe)>>>0)):[],strides:ce?Array.from(($(),O).subarray(Number(ce)>>>0,Number(ye)>>>0)):[]})},1065875:(u,p,g,m,x)=>{t.$b("Gemm",u,{alpha:p,beta:g,transA:m,transB:x})},1065979:u=>{t.$b("MatMul",u,void 0)},1066033:(u,p,g,m)=>{t.$b("ArgMax",u,{keepDims:!!p,selectLastIndex:!!g,axis:m})},1066141:(u,p,g,m)=>{t.$b("ArgMin",u,{keepDims:!!p,selectLastIndex:!!g,axis:m})},1066249:(u,p)=>{t.$b("Softmax",u,{axis:p})},1066312:(u,p)=>{t.$b("Concat",u,{axis:p})},1066372:(u,p,g,m,x)=>{t.$b("Split",u,{axis:p,numOutputs:g,splitSizes:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[]})},1066528:u=>{t.$b("Expand",u,void 0)},1066582:(u,p)=>{t.$b("Gather",u,{axis:Number(p)})},1066653:(u,p)=>{t.$b("GatherElements",u,{axis:Number(p)})},1066732:(u,p)=>{t.$b("GatherND",u,{batch_dims:Number(p)})},1066811:(u,p,g,m,x,k,A,M,V,G,oe)=>{t.$b("Resize",u,{antialias:p,axes:g?Array.from(($(),O).subarray(Number(g)>>>0,Number(m)>>>0)):[],coordinateTransformMode:ke(x),cubicCoeffA:k,excludeOutside:A,extrapolationValue:M,keepAspectRatioPolicy:ke(V),mode:ke(G),nearestMode:ke(oe)})},1067173:(u,p,g,m,x,k,A)=>{t.$b("Slice",u,{starts:p?Array.from(($(),O).subarray(Number(p)>>>0,Number(g)>>>0)):[],ends:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[],axes:k?Array.from(($(),O).subarray(Number(k)>>>0,Number(A)>>>0)):[]})},1067437:u=>{t.$b("Tile",u,void 0)},1067489:(u,p,g)=>{t.$b("InstanceNormalization",u,{epsilon:p,format:g?"NHWC":"NCHW"})},1067603:(u,p,g)=>{t.$b("InstanceNormalization",u,{epsilon:p,format:g?"NHWC":"NCHW"})},1067717:u=>{t.$b("Range",u,void 0)},1067770:(u,p)=>{t.$b("Einsum",u,{equation:ke(p)})},1067851:(u,p,g,m,x)=>{t.$b("Pad",u,{mode:p,value:g,pads:m?Array.from(($(),O).subarray(Number(m)>>>0,Number(x)>>>0)):[]})},1067994:(u,p,g,m,x,k)=>{t.$b("BatchNormalization",u,{epsilon:p,momentum:g,spatial:!!x,trainingMode:!!m,format:k?"NHWC":"NCHW"})},1068163:(u,p,g,m,x,k)=>{t.$b("BatchNormalization",u,{epsilon:p,momentum:g,spatial:!!x,trainingMode:!!m,format:k?"NHWC":"NCHW"})},1068332:(u,p,g)=>{t.$b("CumSum",u,{exclusive:Number(p),reverse:Number(g)})},1068429:(u,p,g)=>{t.$b("DequantizeLinear",u,{axis:p,blockSize:g})},1068519:(u,p,g,m,x)=>{t.$b("GridSample",u,{align_corners:p,mode:ke(g),padding_mode:ke(m),format:x?"NHWC":"NCHW"})},1068689:(u,p,g,m,x)=>{t.$b("GridSample",u,{align_corners:p,mode:ke(g),padding_mode:ke(m),format:x?"NHWC":"NCHW"})},1068859:(u,p)=>{t.$b("ScatterND",u,{reduction:ke(p)})},1068944:(u,p,g,m,x,k,A,M,V)=>{t.$b("Attention",u,{numHeads:p,isUnidirectional:g,maskFilterValue:m,scale:x,doRotary:k,qkvHiddenSizes:A?Array.from(($(),O).subarray(Number(M)>>>0,Number(M)+A>>>0)):[],pastPresentShareBuffer:!!V})},1069216:u=>{t.$b("BiasAdd",u,void 0)},1069271:u=>{t.$b("BiasSplitGelu",u,void 0)},1069332:u=>{t.$b("FastGelu",u,void 0)},1069388:(u,p,g,m,x,k,A,M,V,G,oe,ce,ye,we,gt,en)=>{t.$b("Conv",u,{format:ce?"NHWC":"NCHW",auto_pad:p,dilations:g?Array.from(($(),O).subarray(Number(g)>>>0,Number(m)>>>0)):[],group:x,kernel_shape:k?Array.from(($(),O).subarray(Number(k)>>>0,Number(A)>>>0)):[],pads:M?Array.from(($(),O).subarray(Number(M)>>>0,Number(V)>>>0)):[],strides:G?Array.from(($(),O).subarray(Number(G)>>>0,Number(oe)>>>0)):[],w_is_const:()=>!!($(),F)[Number(ye)>>>0],activation:ke(we),activation_params:gt?Array.from(($(),J).subarray(Number(gt)>>>0,Number(en)>>>0)):[]})},1069972:u=>{t.$b("Gelu",u,void 0)},1070024:(u,p,g,m,x,k,A,M,V)=>{t.$b("GroupQueryAttention",u,{numHeads:p,kvNumHeads:g,scale:m,softcap:x,doRotary:k,rotaryInterleaved:A,smoothSoftmax:M,localWindowSize:V})},1070241:(u,p,g,m)=>{t.$b("LayerNormalization",u,{axis:p,epsilon:g,simplified:!!m})},1070352:(u,p,g,m)=>{t.$b("LayerNormalization",u,{axis:p,epsilon:g,simplified:!!m})},1070463:(u,p,g,m,x,k)=>{t.$b("MatMulNBits",u,{k:p,n:g,accuracyLevel:m,bits:x,blockSize:k})},1070590:(u,p,g,m,x,k)=>{t.$b("MultiHeadAttention",u,{numHeads:p,isUnidirectional:g,maskFilterValue:m,scale:x,doRotary:k})},1070749:(u,p)=>{t.$b("QuickGelu",u,{alpha:p})},1070813:(u,p,g,m,x)=>{t.$b("RotaryEmbedding",u,{interleaved:!!p,numHeads:g,rotaryEmbeddingDim:m,scale:x})},1070952:(u,p,g)=>{t.$b("SkipLayerNormalization",u,{epsilon:p,simplified:!!g})},1071054:(u,p,g)=>{t.$b("SkipLayerNormalization",u,{epsilon:p,simplified:!!g})},1071156:(u,p,g,m)=>{t.$b("GatherBlockQuantized",u,{gatherAxis:p,quantizeAxis:g,blockSize:m})},1071277:u=>{t.Fd(u)},1071311:(u,p)=>t.Hd(Number(u),Number(p),t.Xc.Kd,t.Xc.errors)};function P0(u,p,g){return qs(async()=>{await t.Dd(Number(u),Number(p),Number(g))})}function L0(){return typeof wasmOffsetConverter<"u"}function U0(u,p,g,m){var x=le();try{return To(u,p,g,m)}catch(k){if(ue(x),k!==k+0)throw k;de(1,0)}}function W0(u,p,g){var m=le();try{return vo(u,p,g)}catch(x){if(ue(m),x!==x+0)throw x;de(1,0)}}function q0(u){var p=le();try{yo(u)}catch(g){if(ue(p),g!==g+0)throw g;de(1,0)}}function V0(u,p){var g=le();try{return Qi(u,p)}catch(m){if(ue(g),m!==m+0)throw m;de(1,0)}}function G0(u,p,g){var m=le();try{_o(u,p,g)}catch(x){if(ue(m),x!==x+0)throw x;de(1,0)}}function F0(u,p){var g=le();try{Eo(u,p)}catch(m){if(ue(g),m!==m+0)throw m;de(1,0)}}function H0(u,p,g,m,x,k,A){var M=le();try{return xo(u,p,g,m,x,k,A)}catch(V){if(ue(M),V!==V+0)throw V;de(1,0)}}function j0(u,p,g,m,x,k){var A=le();try{bo(u,p,g,m,x,k)}catch(M){if(ue(A),M!==M+0)throw M;de(1,0)}}function K0(u,p,g,m){var x=le();try{So(u,p,g,m)}catch(k){if(ue(x),k!==k+0)throw k;de(1,0)}}function X0(u,p,g,m,x){var k=le();try{wo(u,p,g,m,x)}catch(A){if(ue(k),A!==A+0)throw A;de(1,0)}}function Z0(u,p,g,m,x,k,A){var M=le();try{ko(u,p,g,m,x,k,A)}catch(V){if(ue(M),V!==V+0)throw V;de(1,0)}}function Y0(u,p,g,m,x,k,A){var M=le();try{Co(u,p,g,m,x,k,A)}catch(V){if(ue(M),V!==V+0)throw V;de(1,0)}}function Q0(u,p,g,m,x,k,A,M){var V=le();try{Ro(u,p,g,m,x,k,A,M)}catch(G){if(ue(V),G!==G+0)throw G;de(1,0)}}function J0(u,p,g,m,x){var k=le();try{return Io(u,p,g,m,x)}catch(A){if(ue(k),A!==A+0)throw A;de(1,0)}}function e_(u,p,g){var m=le();try{return Do(u,p,g)}catch(x){if(ue(m),x!==x+0)throw x;de(1,0)}}function t_(u,p,g,m,x,k,A,M){var V=le();try{Mo(u,p,g,m,x,k,A,M)}catch(G){if(ue(V),G!==G+0)throw G;de(1,0)}}function r_(u,p,g,m,x,k,A,M,V,G,oe,ce){var ye=le();try{zo(u,p,g,m,x,k,A,M,V,G,oe,ce)}catch(we){if(ue(ye),we!==we+0)throw we;de(1,0)}}function i_(u,p,g){var m=le();try{return Bo(u,p,g)}catch(x){if(ue(m),x!==x+0)throw x;return de(1,0),0n}}function n_(u,p,g,m,x,k,A,M,V){var G=le();try{$o(u,p,g,m,x,k,A,M,V)}catch(oe){if(ue(G),oe!==oe+0)throw oe;de(1,0)}}function a_(u){var p=le();try{return No(u)}catch(g){if(ue(p),g!==g+0)throw g;de(1,0)}}function s_(u,p){var g=le();try{return Qo(u,p)}catch(m){if(ue(g),m!==m+0)throw m;return de(1,0),0n}}function o_(u){var p=le();try{return Po(u)}catch(g){if(ue(p),g!==g+0)throw g;return de(1,0),0n}}function u_(u,p,g,m){var x=le();try{return Go(u,p,g,m)}catch(k){if(ue(x),k!==k+0)throw k;de(1,0)}}function l_(u,p,g,m,x){var k=le();try{return Fo(u,p,g,m,x)}catch(A){if(ue(k),A!==A+0)throw A;de(1,0)}}function d_(u,p,g,m,x,k){var A=le();try{return Ho(u,p,g,m,x,k)}catch(M){if(ue(A),M!==M+0)throw M;de(1,0)}}function p_(u,p,g,m,x,k){var A=le();try{return Oo(u,p,g,m,x,k)}catch(M){if(ue(A),M!==M+0)throw M;de(1,0)}}function c_(u,p,g,m,x,k){var A=le();try{return jo(u,p,g,m,x,k)}catch(M){if(ue(A),M!==M+0)throw M;de(1,0)}}function h_(u,p,g,m,x,k,A,M){var V=le();try{return Ao(u,p,g,m,x,k,A,M)}catch(G){if(ue(V),G!==G+0)throw G;de(1,0)}}function f_(u,p,g,m,x){var k=le();try{return Ko(u,p,g,m,x)}catch(A){if(ue(k),A!==A+0)throw A;return de(1,0),0n}}function m_(u,p,g,m){var x=le();try{return Xo(u,p,g,m)}catch(k){if(ue(x),k!==k+0)throw k;de(1,0)}}function g_(u,p,g,m){var x=le();try{return Zo(u,p,g,m)}catch(k){if(ue(x),k!==k+0)throw k;de(1,0)}}function __(u,p,g,m,x,k,A,M,V,G,oe,ce){var ye=le();try{return Yo(u,p,g,m,x,k,A,M,V,G,oe,ce)}catch(we){if(ue(ye),we!==we+0)throw we;de(1,0)}}function y_(u,p,g,m,x,k,A,M,V,G,oe){var ce=le();try{qo(u,p,g,m,x,k,A,M,V,G,oe)}catch(ye){if(ue(ce),ye!==ye+0)throw ye;de(1,0)}}function b_(u,p,g,m,x,k,A,M,V,G,oe,ce,ye,we,gt,en){var x_=le();try{Vo(u,p,g,m,x,k,A,M,V,G,oe,ce,ye,we,gt,en)}catch(tn){if(ue(x_),tn!==tn+0)throw tn;de(1,0)}}function w_(u,p,g){var m=le();try{return Lo(u,p,g)}catch(x){if(ue(m),x!==x+0)throw x;de(1,0)}}function v_(u,p,g){var m=le();try{return Uo(u,p,g)}catch(x){if(ue(m),x!==x+0)throw x;de(1,0)}}function $_(u,p,g,m){var x=le();try{Wo(u,p,g,m)}catch(k){if(ue(x),k!==k+0)throw k;de(1,0)}}function Kr(){if(0<Ne)kt=Kr;else if(n)w?.(t),j();else{for(var u=Te;0<u.length;)u.shift()(t);0<Ne?kt=Kr:(t.calledRun=!0,C||(j(),w?.(t)))}}return n||(st=await Se(),Kr()),t.PTR_SIZE=4,ee?t:new Promise((u,p)=>{w=u,S=p})}var fc,uu,hy=L(()=>{"use strict";fc=ou,uu=globalThis.self?.name?.startsWith("em-pthread"),uu&&ou()}),ln,aa,lu,Pe,mc,Zr,du,pu,dn,cu,pn,gc,cn,_c,Sa=L(()=>{"use strict";xa(),ln=typeof location>"u"?void 0:location.origin,aa=Qe.url>"file:"&&Qe.url<"file;",lu=()=>{if(aa){let e=URL;return new URL(new e("ort.bundle.min.mjs",Qe.url).href,ln).href}return Qe.url},Pe=lu(),mc=()=>{if(Pe&&!Pe.startsWith("blob:"))return Pe.substring(0,Pe.lastIndexOf("/")+1)},Zr=(e,t)=>{try{let r=t??Pe;return(r?new URL(e,r):new URL(e)).origin===ln}catch{return!1}},du=(e,t)=>{let r=t??Pe;try{return(r?new URL(e,r):new URL(e)).href}catch{return}},pu=(e,t)=>`${t??"./"}${e}`,dn=async e=>{let t=await(await fetch(e,{credentials:"same-origin"})).blob();return URL.createObjectURL(t)},cu=async e=>(await import(e)).default,pn=(cy(),kr(pc)).default,gc=async()=>{if(!Pe)throw new Error("Failed to load proxy worker: cannot determine the script source URL.");if(Zr(Pe))return[void 0,pn()];let e=await dn(Pe);return[e,pn(e)]},cn=(hy(),kr(hc)).default,_c=async(e,t,r,i)=>{let n=cn&&!(e||t);if(n)if(Pe)n=Zr(Pe)||i&&!r;else if(i&&!r)n=!0;else throw new Error("cannot determine the script source URL.");if(n)return[void 0,cn];{let a="ort-wasm-simd-threaded.jsep.mjs",s=e??du(a,t),o=r&&s&&!Zr(s,t),l=o?await dn(s):s??pu(a,t);return[o?l:void 0,await cu(l)]}}}),hn,Yr,fr,fn,hu,fu,mu,Ta,be,Ft=L(()=>{"use strict";Sa(),Yr=!1,fr=!1,fn=!1,hu=()=>{if(typeof SharedArrayBuffer>"u")return!1;try{return typeof MessageChannel<"u"&&new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)),WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,5,4,1,3,1,1,10,11,1,9,0,65,0,254,16,2,0,26,11]))}catch{return!1}},fu=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,30,1,28,0,65,0,253,15,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,253,186,1,26,11]))}catch{return!1}},mu=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,19,1,17,0,65,1,253,15,65,2,253,15,65,3,253,15,253,147,2,11]))}catch{return!1}},Ta=async e=>{if(Yr)return Promise.resolve();if(fr)throw new Error("multiple calls to 'initializeWebAssembly()' detected.");if(fn)throw new Error("previous call to 'initializeWebAssembly()' failed.");fr=!0;let t=e.initTimeout,r=e.numThreads;if(e.simd!==!1){if(e.simd==="relaxed"){if(!mu())throw new Error("Relaxed WebAssembly SIMD is not supported in the current environment.")}else if(!fu())throw new Error("WebAssembly SIMD is not supported in the current environment.")}let i=hu();r>1&&!i&&(typeof self<"u"&&!self.crossOriginIsolated&&console.warn("env.wasm.numThreads is set to "+r+", but this will not work unless you enable crossOriginIsolated mode. See https://web.dev/cross-origin-isolation-guide/ for more info."),console.warn("WebAssembly multi-threading is not supported in the current environment. Falling back to single-threading."),e.numThreads=r=1);let n=e.wasmPaths,a=typeof n=="string"?n:void 0,s=n?.mjs,o=s?.href??s,l=n?.wasm,d=l?.href??l,h=e.wasmBinary,[c,f]=await _c(o,a,r>1,!!h||!!d),y=!1,_=[];if(t>0&&_.push(new Promise(w=>{setTimeout(()=>{y=!0,w()},t)})),_.push(new Promise((w,S)=>{let v={numThreads:r};if(h)v.wasmBinary=h,v.locateFile=b=>b;else if(d||a)v.locateFile=b=>d??a+b;else if(o&&o.indexOf("blob:")!==0)v.locateFile=b=>new URL(b,o).href;else if(c){let b=mc();b&&(v.locateFile=T=>b+T)}f(v).then(b=>{fr=!1,Yr=!0,hn=b,w(),c&&URL.revokeObjectURL(c)},b=>{fr=!1,fn=!0,S(b)})})),await Promise.race(_),y)throw new Error(`WebAssembly backend initializing failed due to timeout: ${t}ms`)},be=()=>{if(Yr&&hn)return hn;throw new Error("WebAssembly is not initialized yet.")}}),Ye,pi,me,Ea=L(()=>{"use strict";Ft(),Ye=(e,t)=>{let r=be(),i=r.lengthBytesUTF8(e)+1,n=r._malloc(i);return r.stringToUTF8(e,n,i),t.push(n),n},pi=(e,t,r,i)=>{if(typeof e=="object"&&e!==null){if(r.has(e))throw new Error("Circular reference in options");r.add(e)}Object.entries(e).forEach(([n,a])=>{let s=t?t+n:n;if(typeof a=="object")pi(a,s+".",r,i);else if(typeof a=="string"||typeof a=="number")i(s,a.toString());else if(typeof a=="boolean")i(s,a?"1":"0");else throw new Error(`Can't handle extra config type: ${typeof a}`)})},me=e=>{let t=be(),r=t.stackSave();try{let i=t.PTR_SIZE,n=t.stackAlloc(2*i);t._OrtGetLastError(n,n+i);let a=Number(t.getValue(n,i===4?"i32":"i64")),s=t.getValue(n+i,"*"),o=s?t.UTF8ToString(s):"";throw new Error(`${e} ERROR_CODE: ${a}, ERROR_MESSAGE: ${o}`)}finally{t.stackRestore(r)}}}),yc,fy=L(()=>{"use strict";Ft(),Ea(),yc=e=>{let t=be(),r=0,i=[],n=e||{};try{if(e?.logSeverityLevel===void 0)n.logSeverityLevel=2;else if(typeof e.logSeverityLevel!="number"||!Number.isInteger(e.logSeverityLevel)||e.logSeverityLevel<0||e.logSeverityLevel>4)throw new Error(`log severity level is not valid: ${e.logSeverityLevel}`);if(e?.logVerbosityLevel===void 0)n.logVerbosityLevel=0;else if(typeof e.logVerbosityLevel!="number"||!Number.isInteger(e.logVerbosityLevel))throw new Error(`log verbosity level is not valid: ${e.logVerbosityLevel}`);e?.terminate===void 0&&(n.terminate=!1);let a=0;return e?.tag!==void 0&&(a=Ye(e.tag,i)),r=t._OrtCreateRunOptions(n.logSeverityLevel,n.logVerbosityLevel,!!n.terminate,a),r===0&&me("Can't create run options."),e?.extra!==void 0&&pi(e.extra,"",new WeakSet,(s,o)=>{let l=Ye(s,i),d=Ye(o,i);t._OrtAddRunConfigEntry(r,l,d)!==0&&me(`Can't set a run config entry: ${s} - ${o}.`)}),[r,i]}catch(a){throw r!==0&&t._OrtReleaseRunOptions(r),i.forEach(s=>t._free(s)),a}}}),gu,_u,yu,Rt,bu,bc,my=L(()=>{"use strict";Ft(),Ea(),gu=e=>{switch(e){case"disabled":return 0;case"basic":return 1;case"extended":return 2;case"layout":return 3;case"all":return 99;default:throw new Error(`unsupported graph optimization level: ${e}`)}},_u=e=>{switch(e){case"sequential":return 0;case"parallel":return 1;default:throw new Error(`unsupported execution mode: ${e}`)}},yu=e=>{e.extra||(e.extra={}),e.extra.session||(e.extra.session={});let t=e.extra.session;t.use_ort_model_bytes_directly||(t.use_ort_model_bytes_directly="1"),e.executionProviders&&e.executionProviders.some(r=>(typeof r=="string"?r:r.name)==="webgpu")&&(e.enableMemPattern=!1)},Rt=(e,t,r,i)=>{let n=Ye(t,i),a=Ye(r,i);be()._OrtAddSessionConfigEntry(e,n,a)!==0&&me(`Can't set a session config entry: ${t} - ${r}.`)},bu=async(e,t,r)=>{let i=t.executionProviders;for(let n of i){let a=typeof n=="string"?n:n.name,s=[];switch(a){case"webnn":if(a="WEBNN",Rt(e,"session.disable_quant_qdq","1",r),Rt(e,"session.disable_qdq_constant_folding","1",r),typeof n!="string"){let c=n?.deviceType;c&&Rt(e,"deviceType",c,r)}break;case"webgpu":if(a="JS",typeof n!="string"){let c=n;if(c?.preferredLayout){if(c.preferredLayout!=="NCHW"&&c.preferredLayout!=="NHWC")throw new Error(`preferredLayout must be either 'NCHW' or 'NHWC': ${c.preferredLayout}`);Rt(e,"preferredLayout",c.preferredLayout,r)}}break;case"wasm":case"cpu":continue;default:throw new Error(`not supported execution provider: ${a}`)}let o=Ye(a,r),l=s.length,d=0,h=0;if(l>0){d=be()._malloc(l*be().PTR_SIZE),r.push(d),h=be()._malloc(l*be().PTR_SIZE),r.push(h);for(let c=0;c<l;c++)be().setValue(d+c*be().PTR_SIZE,s[c][0],"*"),be().setValue(h+c*be().PTR_SIZE,s[c][1],"*")}await be()._OrtAppendExecutionProvider(e,o,d,h,l)!==0&&me(`Can't append execution provider: ${a}.`)}},bc=async e=>{let t=be(),r=0,i=[],n=e||{};yu(n);try{let a=gu(n.graphOptimizationLevel??"all"),s=_u(n.executionMode??"sequential"),o=typeof n.logId=="string"?Ye(n.logId,i):0,l=n.logSeverityLevel??2;if(!Number.isInteger(l)||l<0||l>4)throw new Error(`log severity level is not valid: ${l}`);let d=n.logVerbosityLevel??0;if(!Number.isInteger(d)||d<0||d>4)throw new Error(`log verbosity level is not valid: ${d}`);let h=typeof n.optimizedModelFilePath=="string"?Ye(n.optimizedModelFilePath,i):0;if(r=t._OrtCreateSessionOptions(a,!!n.enableCpuMemArena,!!n.enableMemPattern,s,!!n.enableProfiling,0,o,l,d,h),r===0&&me("Can't create session options."),n.executionProviders&&await bu(r,n,i),n.enableGraphCapture!==void 0){if(typeof n.enableGraphCapture!="boolean")throw new Error(`enableGraphCapture must be a boolean value: ${n.enableGraphCapture}`);Rt(r,"enableGraphCapture",n.enableGraphCapture.toString(),i)}if(n.freeDimensionOverrides)for(let[c,f]of Object.entries(n.freeDimensionOverrides)){if(typeof c!="string")throw new Error(`free dimension override name must be a string: ${c}`);if(typeof f!="number"||!Number.isInteger(f)||f<0)throw new Error(`free dimension override value must be a non-negative integer: ${f}`);let y=Ye(c,i);t._OrtAddFreeDimensionOverride(r,y,f)!==0&&me(`Can't set a free dimension override: ${c} - ${f}.`)}return n.extra!==void 0&&pi(n.extra,"",new WeakSet,(c,f)=>{Rt(r,c,f,i)}),[r,i]}catch(a){throw r!==0&&t._OrtReleaseSessionOptions(r)!==0&&me("Can't release session options."),i.forEach(s=>t._free(s)),a}}}),Lt,lt,Ut,yi,ci,Ia,ka,sa,te=L(()=>{"use strict";Lt=e=>{switch(e){case"int8":return 3;case"uint8":return 2;case"bool":return 9;case"int16":return 5;case"uint16":return 4;case"int32":return 6;case"uint32":return 12;case"float16":return 10;case"float32":return 1;case"float64":return 11;case"string":return 8;case"int64":return 7;case"uint64":return 13;case"int4":return 22;case"uint4":return 21;default:throw new Error(`unsupported data type: ${e}`)}},lt=e=>{switch(e){case 3:return"int8";case 2:return"uint8";case 9:return"bool";case 5:return"int16";case 4:return"uint16";case 6:return"int32";case 12:return"uint32";case 10:return"float16";case 1:return"float32";case 11:return"float64";case 8:return"string";case 7:return"int64";case 13:return"uint64";case 22:return"int4";case 21:return"uint4";default:throw new Error(`unsupported data type: ${e}`)}},Ut=(e,t)=>{let r=[-1,4,1,1,2,2,4,8,-1,1,2,8,4,8,-1,-1,-1,-1,-1,-1,-1,.5,.5][e],i=typeof t=="number"?t:t.reduce((n,a)=>n*a,1);return r>0?Math.ceil(i*r):void 0},yi=e=>{switch(e){case"float16":return typeof Float16Array<"u"?Float16Array:Uint16Array;case"float32":return Float32Array;case"uint8":return Uint8Array;case"int8":return Int8Array;case"uint16":return Uint16Array;case"int16":return Int16Array;case"int32":return Int32Array;case"bool":return Uint8Array;case"float64":return Float64Array;case"uint32":return Uint32Array;case"int64":return BigInt64Array;case"uint64":return BigUint64Array;default:throw new Error(`unsupported type: ${e}`)}},ci=e=>{switch(e){case"verbose":return 0;case"info":return 1;case"warning":return 2;case"error":return 3;case"fatal":return 4;default:throw new Error(`unsupported logging level: ${e}`)}},Ia=e=>e==="float32"||e==="float16"||e==="int32"||e==="int64"||e==="uint32"||e==="uint8"||e==="bool"||e==="uint4"||e==="int4",ka=e=>e==="float32"||e==="float16"||e==="int32"||e==="int64"||e==="uint32"||e==="uint64"||e==="int8"||e==="uint8"||e==="bool"||e==="uint4"||e==="int4",sa=e=>{switch(e){case"none":return 0;case"cpu":return 1;case"cpu-pinned":return 2;case"texture":return 3;case"gpu-buffer":return 4;case"ml-tensor":return 5;default:throw new Error(`unsupported data location: ${e}`)}}}),Ca,wc=L(()=>{"use strict";xa(),Ca=async e=>{if(typeof e=="string"){let t=await fetch(e);if(!t.ok)throw new Error(`failed to load external data file: ${e}`);let r=t.headers.get("Content-Length"),i=r?parseInt(r,10):0;if(i<1073741824)return new Uint8Array(await t.arrayBuffer());{if(!t.body)throw new Error(`failed to load external data file: ${e}, no response body.`);let n=t.body.getReader(),a;try{a=new ArrayBuffer(i)}catch(o){if(o instanceof RangeError){let l=Math.ceil(i/65536);a=new WebAssembly.Memory({initial:l,maximum:l}).buffer}else throw o}let s=0;for(;;){let{done:o,value:l}=await n.read();if(o)break;let d=l.byteLength;new Uint8Array(a,s,d).set(l),s+=d}return new Uint8Array(a,0,i)}}else return e instanceof Blob?new Uint8Array(await e.arrayBuffer()):e instanceof Uint8Array?e:new Uint8Array(e)}}),wu,vu,$u,xu,za,Su,pe,dt=L(()=>{"use strict";te(),wu=["V","I","W","E","F"],vu=(e,t)=>{console.log(`[${wu[e]},${new Date().toISOString()}]${t}`)},za=(e,t)=>{$u=e,xu=t},Su=(e,t)=>{let r=ci(e),i=ci($u);r>=i&&vu(r,typeof t=="function"?t():t)},pe=(...e)=>{xu&&Su(...e)}}),Tu,Qt,R,hi,vc,$c,xc,ne=L(()=>{"use strict";Tu=class{static calcMatMulShape(e,t){return e[1]!==t[0]?void 0:[e[0],t[1]]}},Qt=class{static calcShape(e,t,r=!1){let i=e.length,n=t.length;if(i===0)return t;if(n===0)return e;let a=Math.max(e.length,t.length),s=new Array(a);if(r){if(i<2||n<2)return;let o=Tu.calcMatMulShape([e[i-2],e[i-1]],[t[n-2],t[n-1]]);if(o===void 0)return;[s[a-2],s[a-1]]=o}for(let o=r?3:1;o<=a;o++){let l=i-o<0?1:e[i-o],d=n-o<0?1:t[n-o];if(l!==d&&l>1&&d>1)return;let h=Math.max(l,d);if(l&&d)s[a-o]=Math.max(l,d);else{if(h>1)return;s[a-o]=0}}return s}static isValidBroadcast(e,t){let r=e.length,i=t.length;if(r>i)return!1;for(let n=1;n<=r;n++)if(e[r-n]!==1&&e[r-n]!==t[i-n])return!1;return!0}},R=class li{static size(t){return li.getSizeFromDimensionRange(t,0,t.length)}static convertShape(t,r=4){let i=t.length;if(i===0)return[];let n=new Array(i),a=i-1;for(;a>=0;){if(t[a]%r===0){n[a]=t[a]/r;break}if(r%t[a]!==0)throw new Error("cannot convert shape");n[a]=1,r/=t[a],a--}for(a--;a>=0;a--)n[a]=t[a];return n}static sizeFromDimension(t,r){if(r<0||r>t.length)throw new Error(`invalid dimension of ${r} for sizeFromDimension as Tensor has ${t.length} dimensions.`);return li.getSizeFromDimensionRange(t,r,t.length)}static sizeToDimension(t,r){if(r<0||r>t.length)throw new Error(`invalid dimension of ${r} for sizeToDimension as Tensor has ${t.length} dimensions.`);return li.getSizeFromDimensionRange(t,0,r)}static getSizeFromDimensionRange(t,r,i){let n=1;for(let a=r;a<i;a++){if(t[a]<0)throw new Error("cannot get valid size from specified dimension range. Most likely the range contains negative values in them.");n*=Number(t[a])}return n}static computeStrides(t){let r=t.length;if(r===0)return[];if(r===1)return[1];let i=new Array(r);i[r-1]=1,i[r-2]=t[r-1];for(let n=r-3;n>=0;--n)i[n]=i[n+1]*t[n+1];return i}static normalizeAxis(t,r){if(t<-r&&t>=r)throw new Error("unsupported axis for this operation.");return t<0?t+r:t}static normalizeAxes(t,r){return t.map(i=>this.normalizeAxis(i,r??t.length))}static sortBasedOnPerm(t,r){return r?r.map(i=>t[i]):t.slice().reverse()}static padShape(t,r){let i=t.length;return t.map((n,a)=>n+r[a]+r[a+i])}static areEqual(t,r){return t.length!==r.length?!1:t.every((i,n)=>i===r[n])}},hi=class $t{static adjustPoolAttributes(t,r,i,n,a,s){if(!t&&i.length!==r.length-2)throw new Error("length of specified kernel shapes should be 2 less than length of input dimensions");if(t)for(let o=0;o<r.length-2;o++)o>=i.length?i.push(r[o+2]):i[o]=r[o+2];for(let o=0;o<i.length;o++)if(o<n.length){if(n[o]<0)throw new Error("strides should be greater than or equal to 1")}else n.push(1);for(let o=0;o<i.length;o++)if(o<a.length){if(a[o]<0)throw new Error("dilations should be greater than or equal to 1")}else a.push(1);for(let o=0;o<i.length*2;o++)if(o<s.length){if(s[o]<0)throw new Error("pad should be greater than or equal to 1")}else s.push(0);for(let o=0;o<i.length;o++){if(i[o]<=0)throw new Error("kernel shapes need to be greater than 0");if(s[o]>=i[o]||s[o+i.length]>=i[o])throw new Error("pads should be smaller than kernel")}}static adjustPadsBasedOnAutoPad(t,r,i,n,a,s,o){if(o){if(a.length!==2*(t.length-2))throw new Error("length of pads should be twice the length of data dimensions");if(r.length!==t.length-2)throw new Error("length of strides should be the length of data dimensions");if(n.length!==t.length-2)throw new Error("length of kernel shapes should be the length of data dimensions");for(let l=0;l<t.length-2;l++)$t.adjustPadAndReturnShape(t[l+(s?1:2)],r[l],i[l],n[l],a,l,l+t.length-2,o)}}static computePoolOutputShape(t,r,i,n,a,s,o,l=0){if(r.length<=0)throw new Error("input shape must be of size greater than 0");let d=[r[0],r[1]];return $t.computeShapeHelper(t,r,d,i,n,a,s,o,l),d}static computeConvOutputShape(t,r,i,n,a,s,o){if(t.length<=0||r.length<=0)throw new Error("invalid input tensor dims or invalid filter tensor dims");let l=[t[0],r[0]];return $t.computeShapeHelper(!1,t,l,i,n,a,s,o),l}static computeShapeHelper(t,r,i,n,a,s,o,l,d=0){if(t)for(let h=0;h<r.length-2;h++)i.push(1);else for(let h=0;h<r.length-2;h++)i.push($t.adjustPadAndReturnShape(r[h+2],n[h],a[h],s[h],o,h,h+r.length-2,l,d))}static computeOutputSize(t,r,i,n,a){let s=Math.floor(t/r)+1;return a===1&&(s=Math.ceil(t/r)+1,(s-1)*r>=i+n&&(s-=1)),s}static adjustPadAndReturnShape(t,r,i,n,a,s,o,l,d=0){let h=i*(n-1)+1;if(l&&l!=="NOTSET")switch(l){case"VALID":return a[s]=0,a[o]=0,$t.computeOutputSize(t-h,r,t,0,d);case"SAME_LOWER":case"SAME_UPPER":if(i!==1)throw new Error("Dilation not supported for SAME_UPPER or SAME_LOWER");{let c=(Math.floor((t+r-1)/r)-1)*r+n-t;return a[s]=Math.floor(l==="SAME_LOWER"?(c+1)/2:c/2),a[o]=c-a[s],$t.computeOutputSize(t+a[s]+a[o]-h,r,t,a[s],d)}default:throw new Error("Unsupported AutoPad type")}else return $t.computeOutputSize(t+a[s]+a[o]-h,r,t,a[s],d)}},vc=class{static getShapeOfGemmResult(e,t,r,i,n){if(e.length!==2||r.length!==2)throw new Error("shape need to be of size 2");let a,s,o;t?(a=e[1],s=e[0]):(a=e[0],s=e[1]);let l=-1;if(i?(o=r[0],l=1):(o=r[1],l=0),r[l]!==s)throw new Error("dimension mismatch");if(a<=0||o<=0||s<=0)throw new Error("invalid shape specified");if(n&&!Qt.isValidBroadcast(n,[a,o]))throw new Error("gemm: invalid bias shape for broadcast");return[a,o,s]}},$c=-34028234663852886e22,xc=34028234663852886e22}),Oa,Sc=L(()=>{"use strict";te(),Oa=(e,t)=>new(yi(t))(e)}),mn,Eu,gn,Iu,_n,ku,yn,bn,wn,Cu,Tc,gy=L(()=>{"use strict";te(),dt(),mn=new Map([["float32",32],["float16",16],["int32",32],["uint32",32],["int64",64],["uint64",64],["int8",8],["uint8",8],["int4",4],["uint4",4]]),Eu=(e,t)=>{if(t==="int32")return e;let r=mn.get(t);if(!r)throw new Error(`WebNN backend does not support data type: ${t}`);let i=r/8;if(e.byteLength%i!==0)throw new Error(`Invalid Uint8Array length - must be a multiple of ${i}.`);let n=e.byteLength/i,a=new(yi(t))(e.buffer,e.byteOffset,n);switch(t){case"int64":case"uint64":{let s=new Int32Array(n);for(let o=0;o<n;o++){let l=a[o];if(l>2147483647n||l<-2147483648n)throw new Error("Can not convert int64 data to int32 - value out of range.");s[o]=Number(l)}return new Uint8Array(s.buffer)}case"int8":case"uint8":case"uint32":{if(t==="uint32"&&a.some(o=>o>2147483647))throw new Error("Can not convert uint32 data to int32 - value out of range.");let s=Int32Array.from(a,Number);return new Uint8Array(s.buffer)}default:throw new Error(`Unsupported data conversion from ${t} to 'int32'`)}},gn=(e,t)=>{if(t==="int32")return e;if(e.byteLength%4!==0)throw new Error("Invalid Uint8Array length - must be a multiple of 4 (int32).");let r=e.byteLength/4,i=new Int32Array(e.buffer,e.byteOffset,r);switch(t){case"int64":{let n=BigInt64Array.from(i,BigInt);return new Uint8Array(n.buffer)}case"uint64":{if(i.some(a=>a<0))throw new Error("Can not convert int32 data to uin64 - negative value found.");let n=BigUint64Array.from(i,BigInt);return new Uint8Array(n.buffer)}case"int8":{if(i.some(a=>a<-128||a>127))throw new Error("Can not convert int32 data to int8 - value out of range.");let n=Int8Array.from(i,Number);return new Uint8Array(n.buffer)}case"uint8":{if(i.some(n=>n<0||n>255))throw new Error("Can not convert int32 data to uint8 - value out of range.");return Uint8Array.from(i,Number)}case"uint32":{if(i.some(a=>a<0))throw new Error("Can not convert int32 data to uint32 - negative value found.");let n=Uint32Array.from(i,Number);return new Uint8Array(n.buffer)}default:throw new Error(`Unsupported data conversion from 'int32' to ${t}`)}},Iu=1,_n=()=>Iu++,ku=new Map([["int8","int32"],["uint8","int32"],["uint32","int32"],["int64","int32"]]),yn=(e,t)=>{let r=mn.get(e);if(!r)throw new Error(`WebNN backend does not support data type: ${e}`);return t.length>0?Math.ceil(t.reduce((i,n)=>i*n)*r/8):0},bn=class{constructor(e){this.isDataConverted=!1;let{sessionId:t,context:r,tensor:i,dataType:n,shape:a,fallbackDataType:s}=e;this.sessionId=t,this.mlContext=r,this.mlTensor=i,this.dataType=n,this.tensorShape=a,this.fallbackDataType=s}get tensor(){return this.mlTensor}get type(){return this.dataType}get fallbackType(){return this.fallbackDataType}get shape(){return this.tensorShape}get byteLength(){return yn(this.dataType,this.tensorShape)}destroy(){pe("verbose",()=>"[WebNN] TensorWrapper.destroy"),this.mlTensor.destroy()}write(e){this.mlContext.writeTensor(this.mlTensor,e)}async read(e){if(this.fallbackDataType){let t=await this.mlContext.readTensor(this.mlTensor),r=gn(new Uint8Array(t),this.dataType);if(e){(e instanceof ArrayBuffer?new Uint8Array(e):new Uint8Array(e.buffer,e.byteOffset,e.byteLength)).set(r);return}else return new Uint8Array(r).buffer}else return e?this.mlContext.readTensor(this.mlTensor,e):this.mlContext.readTensor(this.mlTensor)}canReuseTensor(e,t,r){return this.mlContext===e&&this.dataType===t&&this.tensorShape.length===r.length&&this.tensorShape.every((i,n)=>i===r[n])}setIsDataConverted(e){this.isDataConverted=e}},wn=class{constructor(e,t){this.tensorManager=e,this.wrapper=t}get tensorWrapper(){return this.wrapper}releaseTensor(){this.tensorWrapper&&(this.tensorManager.releaseTensor(this.tensorWrapper),this.wrapper=void 0)}async ensureTensor(e,t,r,i){let n=this.tensorManager.getMLContext(e),a=this.tensorManager.getMLOpSupportLimits(e),s;if(!a?.input.dataTypes.includes(t)){if(s=ku.get(t),!s||a?.input.dataTypes.includes(s))throw new Error(`WebNN backend does not support data type: ${t}`);pe("verbose",()=>`[WebNN] TensorIdTracker.ensureTensor: fallback dataType from ${t} to ${s}`)}if(this.wrapper){if(this.wrapper.canReuseTensor(n,t,r))return this.wrapper.tensor;if(i){if(this.wrapper.byteLength!==yn(t,r))throw new Error("Unable to copy data to tensor with different size.");this.activeUpload=new Uint8Array(await this.wrapper.read())}this.tensorManager.releaseTensor(this.wrapper)}let o=typeof MLTensorUsage>"u"?void 0:MLTensorUsage.READ|MLTensorUsage.WRITE;return this.wrapper=await this.tensorManager.getCachedTensor(e,t,r,o,!0,!0,s),i&&this.activeUpload&&(this.wrapper.write(this.activeUpload),this.activeUpload=void 0),this.wrapper.tensor}upload(e){let t=e;if(this.wrapper){if(this.wrapper.fallbackType)if(this.wrapper.fallbackType==="int32")t=Eu(e,this.wrapper.type),this.wrapper.setIsDataConverted(!0);else throw new Error(`Unsupported fallback data type: ${this.wrapper.fallbackType}`);if(e.byteLength===this.wrapper.byteLength){this.wrapper.write(t);return}else pe("verbose",()=>"Data size does not match tensor size. Releasing tensor."),this.releaseTensor()}this.activeUpload?this.activeUpload.set(t):this.activeUpload=new Uint8Array(t)}async download(e){if(this.activeUpload){let t=this.wrapper?.isDataConverted?gn(this.activeUpload,this.wrapper?.type):this.activeUpload;if(e){e instanceof ArrayBuffer?new Uint8Array(e).set(t):new Uint8Array(e.buffer,e.byteOffset,e.byteLength).set(t);return}else return t.buffer}if(!this.wrapper)throw new Error("Tensor has not been created.");return e?this.wrapper.read(e):this.wrapper.read()}},Cu=class{constructor(e){this.backend=e,this.tensorTrackersById=new Map,this.freeTensors=[],this.externalTensors=new Set}getMLContext(e){let t=this.backend.getMLContext(e);if(!t)throw new Error("MLContext not found for session.");return t}getMLOpSupportLimits(e){return this.backend.getMLOpSupportLimits(e)}reserveTensorId(){let e=_n();return this.tensorTrackersById.set(e,new wn(this)),e}releaseTensorId(e){let t=this.tensorTrackersById.get(e);t&&(this.tensorTrackersById.delete(e),t.tensorWrapper&&this.releaseTensor(t.tensorWrapper))}async ensureTensor(e,t,r,i,n){pe("verbose",()=>`[WebNN] TensorManager.ensureTensor {tensorId: ${t}, dataType: ${r}, shape: ${i}, copyOld: ${n}}`);let a=this.tensorTrackersById.get(t);if(!a)throw new Error("Tensor not found.");return a.ensureTensor(e,r,i,n)}upload(e,t){let r=this.tensorTrackersById.get(e);if(!r)throw new Error("Tensor not found.");r.upload(t)}async download(e,t){pe("verbose",()=>`[WebNN] TensorManager.download {tensorId: ${e}, dstBuffer: ${t?.byteLength}}`);let r=this.tensorTrackersById.get(e);if(!r)throw new Error("Tensor not found.");return r.download(t)}releaseTensorsForSession(e){for(let t of this.freeTensors)t.sessionId===e&&t.destroy();this.freeTensors=this.freeTensors.filter(t=>t.sessionId!==e)}registerTensor(e,t,r,i){let n=this.getMLContext(e),a=_n(),s=new bn({sessionId:e,context:n,tensor:t,dataType:r,shape:i});return this.tensorTrackersById.set(a,new wn(this,s)),this.externalTensors.add(s),a}async getCachedTensor(e,t,r,i,n,a,s){let o=this.getMLContext(e);for(let[d,h]of this.freeTensors.entries())if(h.canReuseTensor(o,t,r)){pe("verbose",()=>`[WebNN] Reusing tensor {dataType: ${t}, ${s?`fallbackDataType: ${s},`:""} shape: ${r}`);let c=this.freeTensors.splice(d,1)[0];return c.sessionId=e,c}pe("verbose",()=>`[WebNN] MLContext.createTensor {dataType: ${t}, ${s?`fallbackDataType: ${s},`:""} shape: ${r}}`);let l=await o.createTensor({dataType:s??t,shape:r,dimensions:r,usage:i,writable:n,readable:a});return new bn({sessionId:e,context:o,tensor:l,dataType:t,shape:r,fallbackDataType:s})}releaseTensor(e){this.externalTensors.has(e)&&this.externalTensors.delete(e),this.freeTensors.push(e)}},Tc=(...e)=>new Cu(...e)}),mr,zu,Ec,_y=L(()=>{"use strict";te(),Ft(),Sc(),gy(),dt(),mr=new Map([[1,"float32"],[10,"float16"],[6,"int32"],[12,"uint32"],[7,"int64"],[13,"uint64"],[22,"int4"],[21,"uint4"],[3,"int8"],[2,"uint8"],[9,"uint8"]]),zu=(e,t)=>{if(e===t)return!0;if(e===void 0||t===void 0)return!1;let r=Object.keys(e).sort(),i=Object.keys(t).sort();return r.length===i.length&&r.every((n,a)=>n===i[a]&&e[n]===t[n])},Ec=class{constructor(e){this.tensorManager=Tc(this),this.mlContextBySessionId=new Map,this.sessionIdsByMLContext=new Map,this.mlContextCache=[],this.sessionGraphInputs=new Map,this.sessionGraphOutputs=new Map,this.temporaryGraphInputs=[],this.temporaryGraphOutputs=[],this.temporarySessionTensorIds=new Map,this.mlOpSupportLimitsBySessionId=new Map,za(e.logLevel,!!e.debug)}get currentSessionId(){if(this.activeSessionId===void 0)throw new Error("No active session");return this.activeSessionId}onRunStart(e){pe("verbose",()=>`[WebNN] onRunStart {sessionId: ${e}}`),this.activeSessionId=e}onRunEnd(e){pe("verbose",()=>`[WebNN] onRunEnd {sessionId: ${e}}`);let t=this.temporarySessionTensorIds.get(e);if(t){for(let r of t)pe("verbose",()=>`[WebNN] releasing temporary tensor {tensorId: ${r}}`),this.tensorManager.releaseTensorId(r);this.temporarySessionTensorIds.delete(e),this.activeSessionId=void 0}}async createMLContext(e){if(e instanceof GPUDevice){let r=this.mlContextCache.findIndex(i=>i.gpuDevice===e);if(r!==-1)return this.mlContextCache[r].mlContext;{let i=await navigator.ml.createContext(e);return this.mlContextCache.push({gpuDevice:e,mlContext:i}),i}}else if(e===void 0){let r=this.mlContextCache.findIndex(i=>i.options===void 0&&i.gpuDevice===void 0);if(r!==-1)return this.mlContextCache[r].mlContext;{let i=await navigator.ml.createContext();return this.mlContextCache.push({mlContext:i}),i}}let t=this.mlContextCache.findIndex(r=>zu(r.options,e));if(t!==-1)return this.mlContextCache[t].mlContext;{let r=await navigator.ml.createContext(e);return this.mlContextCache.push({options:e,mlContext:r}),r}}registerMLContext(e,t){this.mlContextBySessionId.set(e,t);let r=this.sessionIdsByMLContext.get(t);r||(r=new Set,this.sessionIdsByMLContext.set(t,r)),r.add(e),this.mlOpSupportLimitsBySessionId.has(e)||this.mlOpSupportLimitsBySessionId.set(e,t.opSupportLimits()),this.temporaryGraphInputs.length>0&&(this.sessionGraphInputs.set(e,this.temporaryGraphInputs),this.temporaryGraphInputs=[]),this.temporaryGraphOutputs.length>0&&(this.sessionGraphOutputs.set(e,this.temporaryGraphOutputs),this.temporaryGraphOutputs=[])}onReleaseSession(e){this.sessionGraphInputs.delete(e),this.sessionGraphOutputs.delete(e);let t=this.mlContextBySessionId.get(e);if(!t)return;this.tensorManager.releaseTensorsForSession(e),this.mlContextBySessionId.delete(e),this.mlOpSupportLimitsBySessionId.delete(e);let r=this.sessionIdsByMLContext.get(t);if(r.delete(e),r.size===0){this.sessionIdsByMLContext.delete(t);let i=this.mlContextCache.findIndex(n=>n.mlContext===t);i!==-1&&this.mlContextCache.splice(i,1)}}getMLContext(e){return this.mlContextBySessionId.get(e)}getMLOpSupportLimits(e){return this.mlOpSupportLimitsBySessionId.get(e)}reserveTensorId(){return this.tensorManager.reserveTensorId()}releaseTensorId(e){pe("verbose",()=>`[WebNN] releaseTensorId {tensorId: ${e}}`),this.tensorManager.releaseTensorId(e)}async ensureTensor(e,t,r,i,n){let a=mr.get(r);if(!a)throw new Error(`Unsupported ONNX data type: ${r}`);return this.tensorManager.ensureTensor(e??this.currentSessionId,t,a,i,n)}async createTemporaryTensor(e,t,r){pe("verbose",()=>`[WebNN] createTemporaryTensor {onnxDataType: ${t}, shape: ${r}}`);let i=mr.get(t);if(!i)throw new Error(`Unsupported ONNX data type: ${t}`);let n=this.tensorManager.reserveTensorId();await this.tensorManager.ensureTensor(e,n,i,r,!1);let a=this.temporarySessionTensorIds.get(e);return a?a.push(n):this.temporarySessionTensorIds.set(e,[n]),n}uploadTensor(e,t){if(!be().shouldTransferToMLTensor)throw new Error("Trying to upload to a MLTensor while shouldTransferToMLTensor is false");pe("verbose",()=>`[WebNN] uploadTensor {tensorId: ${e}, data: ${t.byteLength}}`),this.tensorManager.upload(e,t)}async downloadTensor(e,t){return this.tensorManager.download(e,t)}createMLTensorDownloader(e,t){return async()=>{let r=await this.tensorManager.download(e);return Oa(r,t)}}registerMLTensor(e,t,r,i){let n=mr.get(r);if(!n)throw new Error(`Unsupported ONNX data type: ${r}`);let a=this.tensorManager.registerTensor(e,t,n,i);return pe("verbose",()=>`[WebNN] registerMLTensor {tensor: ${t}, dataType: ${n}, dimensions: ${i}} -> {tensorId: ${a}}`),a}registerGraphInput(e){this.temporaryGraphInputs.push(e)}registerGraphOutput(e){this.temporaryGraphOutputs.push(e)}isGraphInput(e,t){let r=this.sessionGraphInputs.get(e);return r?r.includes(t):!1}isGraphOutput(e,t){let r=this.sessionGraphOutputs.get(e);return r?r.includes(t):!1}isGraphInputOutputTypeSupported(e,t,r=!0){let i=mr.get(Lt(t)),n=this.mlOpSupportLimitsBySessionId.get(e);return typeof i>"u"?!1:r?!!n?.input.dataTypes.includes(i):!!n?.output.dataTypes.includes(i)}flush(){}}}),Aa=L(()=>{"use strict"}),vn,Qr,Jr,Ou,Au,$n,oa,Ru,Ic,yy=L(()=>{"use strict";dt(),Aa(),vn=new Map([[64,250],[128,200],[256,200],[512,200],[2048,230],[4096,200],[8192,50],[16384,50],[32768,50],[65536,50],[131072,50],[262144,50],[524288,50],[1048576,50],[2097152,30],[4194304,20],[8388608,10],[12582912,10],[16777216,10],[26214400,15],[33554432,22],[44236800,2],[58982400,6],[67108864,6],[134217728,6],[167772160,6]]),Qr=[],Jr=e=>Math.ceil(Number(e)/16)*16,Ou=e=>{for(let t=0;t<Qr.length;t++){let r=Qr[t];if(e<=r)return r}return Math.ceil(e/16)*16},Au=1,$n=()=>Au++,oa=async(e,t,r,i)=>{let n=Jr(r),a=e.device.createBuffer({size:n,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{let s=e.getCommandEncoder();e.endComputePass(),s.copyBufferToBuffer(t,0,a,0,n),e.flush(),await a.mapAsync(GPUMapMode.READ);let o=a.getMappedRange();if(i){let l=i();return l.set(new Uint8Array(o,0,r)),l}else return new Uint8Array(o.slice(0,r))}finally{a.destroy()}},Ru=class{constructor(e){this.backend=e,this.storageCache=new Map,this.freeBuffers=new Map,this.freeUniformBuffers=new Map,this.buffersPending=[],this.capturedPendingBuffers=new Map;for(let[t]of vn)Qr.push(t),this.freeBuffers.set(t,[]),this.freeUniformBuffers.set(t,[]);this.sessionCount=0}upload(e,t){let r=t.buffer,i=t.byteOffset,n=t.byteLength,a=Jr(n),s=this.storageCache.get(e);if(!s)throw new Error("gpu data for uploading does not exist");if(Number(s.originalSize)!==n)throw new Error(`inconsistent data size. gpu data size=${s.originalSize}, data size=${n}`);if(a===n&&i%4===0)this.backend.device.queue.writeBuffer(s.gpuData.buffer,0,r,i,n);else{let o=new Uint8Array(a);o.set(t),this.backend.device.queue.writeBuffer(s.gpuData.buffer,0,o,0,a)}pe("verbose",()=>`[WebGPU] GpuDataManager.upload(id=${e})`)}memcpy(e,t){let r=this.storageCache.get(e);if(!r)throw new Error("source gpu data for memcpy does not exist");let i=this.storageCache.get(t);if(!i)throw new Error("destination gpu data for memcpy does not exist");if(r.originalSize!==i.originalSize)throw new Error("inconsistent source and destination gpu data size");let n=Jr(r.originalSize),a=this.backend.getCommandEncoder();this.backend.endComputePass(),a.copyBufferToBuffer(r.gpuData.buffer,0,i.gpuData.buffer,0,n)}registerExternalBuffer(e,t,r){let i;if(r){if(i=r[0],e===r[1])return pe("verbose",()=>`[WebGPU] GpuDataManager.registerExternalBuffer(size=${t}) => id=${i}, buffer is the same, skip.`),i;if(this.backend.capturedCommandList.has(this.backend.currentSessionId))throw new Error(`Registering a different external buffer under graph capture mode is not supported yet.
             Please use the previous external buffer!`)}else i=$n();return this.storageCache.set(i,{gpuData:{id:i,type:0,buffer:e},originalSize:t}),pe("verbose",()=>`[WebGPU] GpuDataManager.registerExternalBuffer(size=${t}) => id=${i}, registered.`),i}unregisterExternalBuffer(e){e!==void 0&&(this.storageCache.delete(e),pe("verbose",()=>`[WebGPU] GpuDataManager.unregisterExternalBuffer() => id=${e}`))}create(e,t=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST){let r=Ou(e),i,n=(t&GPUBufferUsage.STORAGE)===GPUBufferUsage.STORAGE,a=(t&GPUBufferUsage.UNIFORM)===GPUBufferUsage.UNIFORM;if(n||a){let o=(n?this.freeBuffers:this.freeUniformBuffers).get(r);o?o.length>0?i=o.pop():i=this.backend.device.createBuffer({size:r,usage:t}):i=this.backend.device.createBuffer({size:r,usage:t})}else i=this.backend.device.createBuffer({size:r,usage:t});let s={id:$n(),type:0,buffer:i};return this.storageCache.set(s.id,{gpuData:s,originalSize:Number(e)}),pe("verbose",()=>`[WebGPU] GpuDataManager.create(size=${e}) => id=${s.id}`),s}get(e){return this.storageCache.get(e)?.gpuData}release(e){let t=typeof e=="bigint"?Number(e):e,r=this.storageCache.get(t);if(!r){if(this.storageCache.size===0)return 0;throw new Error("releasing data does not exist")}return pe("verbose",()=>`[WebGPU] GpuDataManager.release(id=${t}), gpuDataId=${r.gpuData.id}`),this.storageCache.delete(t),this.buffersPending.push(r.gpuData.buffer),r.originalSize}async download(e,t){let r=this.storageCache.get(Number(e));if(!r)throw new Error("data does not exist");await oa(this.backend,r.gpuData.buffer,r.originalSize,t)}refreshPendingBuffers(){if(this.buffersPending.length!==0)if(this.backend.sessionStatus==="default"){for(let e of this.buffersPending){let t=vn.get(e.size);if((e.usage&GPUBufferUsage.STORAGE)===GPUBufferUsage.STORAGE){let r=this.freeBuffers.get(e.size)||[];t===void 0||r.length>=t?e.destroy():r.push(e)}else if((e.usage&GPUBufferUsage.UNIFORM)===GPUBufferUsage.UNIFORM){let r=this.freeUniformBuffers.get(e.size)||[];t===void 0||r.length>=t?e.destroy():r.push(e)}else e.destroy()}this.buffersPending=[]}else{let e=this.capturedPendingBuffers.get(this.backend.currentSessionId);e||(e=[],this.capturedPendingBuffers.set(this.backend.currentSessionId,e));for(let t of this.buffersPending)e.push(t);this.buffersPending=[]}}dispose(){this.freeBuffers.forEach(e=>{e.forEach(t=>{t.destroy()})}),this.freeUniformBuffers.forEach(e=>{e.forEach(t=>{t.destroy()})}),this.storageCache.forEach(e=>{e.gpuData.buffer.destroy()}),this.capturedPendingBuffers.forEach(e=>{e.forEach(t=>{t.destroy()})}),this.storageCache=new Map,this.freeBuffers=new Map,this.freeUniformBuffers=new Map,this.capturedPendingBuffers=new Map}onCreateSession(){this.sessionCount+=1}onReleaseSession(e){let t=this.capturedPendingBuffers.get(e);t&&(t.forEach(r=>{r.destroy()}),this.capturedPendingBuffers.delete(e)),this.sessionCount-=1,this.sessionCount===0&&(pe("warning",()=>"[WebGPU] Clearing webgpu buffer cache"),this.storageCache.forEach(r=>{r.gpuData.buffer.destroy()}),this.storageCache=new Map)}},Ic=(...e)=>new Ru(...e)}),Du,fe,Ie=L(()=>{"use strict";Du=class{constructor(e){Object.assign(this,e)}get cacheKey(){return this.key||(this.key=Object.getOwnPropertyNames(this).sort().map(e=>`${this[e]}`).join(";")),this.key}},fe=e=>new Du(e)}),Jt,ei,ze,Ce,Q,Ee,ua,Yt,Tt,Z,gr,D,H,kc,Ra,Mu,Cc,ae=L(()=>{"use strict";te(),ne(),Jt=64,ei=(e,t)=>{if(t===3)throw new Error("vec3 has same alignment as vec4, use vec4 instead");switch(Number(e)){case 10:return t>1?`vec${t}<f16>`:"f16";case 1:return t>1?`vec${t}<f32>`:"f32";case 6:return t>1?`vec${t}<i32>`:"i32";case 12:return t>1?`vec${t}<u32>`:"u32";case 7:if(t>1)throw new Error("currently not supported vecX of uint64 yet");return["vec2<u32>","i32"];case 13:if(t>1)throw new Error("currently not supported vecX of uint64 yet");return["vec2<u32>","u32"];case 9:if(t!==4)throw new Error("bool must be vec4");return["u32","vec4<bool>"];case 22:return"i32";case 21:return"u32";default:throw new Error(`Unknown data type: ${e}`)}},ze=(e,t=1)=>{let r=ei(e,t);return typeof r=="string"?r:r[0]},Ce=(e,t=1)=>{let r=ei(e,t);return typeof r=="string"?r:r[1]},Q=(...e)=>{let t=[];return e.forEach(r=>{r.length!==0&&t.push({type:12,data:r},{type:12,data:R.computeStrides(r)})}),t},Ee=e=>e%4===0?4:e%2===0?2:1,ua=(e="f32",t,r="0")=>!t||t===1?`${e}(${r})`:`vec${t}<${e}>(${r})`,Yt=(e,t,r)=>e==="f32"?r:t===1?`f32(${r})`:`vec${t}<f32>(${r})`,Tt=(e,t)=>t===4?`(${e}.x + ${e}.y + ${e}.z + ${e}.w)`:t===2?`(${e}.x + ${e}.y)`:t===3?`(${e}.x + ${e}.y + ${e}.z)`:e,Z=(e,t,r,i)=>e.startsWith("uniforms.")&&r>4?typeof t=="string"?i==="f16"?`${e}[(${t}) / 8][(${t}) % 8 / 4][(${t}) % 8 % 4]`:`${e}[(${t}) / 4][(${t}) % 4]`:i==="f16"?`${e}[${Math.floor(t/8)}][${Math.floor(t%8/4)}][${t%8%4}]`:`${e}[${Math.floor(t/4)}][${t%4}]`:r>1?`${e}[${t}]`:e,gr=(e,t,r,i,n)=>{let a=typeof r=="number",s=a?r:r.length,o=[...new Array(s).keys()],l=s<2?"u32":s<=4?`vec${s}<u32>`:`array<u32, ${s}>`,d=ei(t,n),h=typeof d=="string"?d:d[1],c=typeof d=="string"?d:d[0],f={indices:l,value:h,storage:c,tensor:t},y=N=>typeof N=="string"?N:`${N}u`,_={offsetToIndices:!1,indicesToOffset:!1,broadcastedIndicesToOffset:!1,set:!1,setByIndices:!1,get:!1,getByIndices:!1},w=a?"uniforms.":"",S=`${w}${e}_shape`,v=`${w}${e}_strides`,b="";for(let N=0;N<s-1;N++)b+=`
    let dim${N} = current / ${Z(v,N,s)};
    let rest${N} = current % ${Z(v,N,s)};
    indices[${N}] = dim${N};
    current = rest${N};
    `;b+=`indices[${s-1}] = current;`;let T=s<2?"":`
  fn o2i_${e}(offset: u32) -> ${f.indices} {
    var indices: ${f.indices};
    var current = offset;
    ${b}
    return indices;
  }`,E=N=>(_.offsetToIndices=!0,s<2?N:`o2i_${e}(${N})`),I=[];if(s>=2)for(let N=s-1;N>=0;N--)I.push(`${Z(v,N,s)} * (indices[${N}])`);let C=s<2?"":`
  fn i2o_${e}(indices: ${f.indices}) -> u32 {
    return ${I.join("+")};
  }`,z=N=>(_.indicesToOffset=!0,s<2?N:`i2o_${e}(${N})`),$=(...N)=>s===0?"0u":`${f.indices}(${N.map(y).join(",")})`,B=(N,ee)=>s<2?`${N}`:`${Z(N,ee,s)}`,W=(N,ee,Y)=>s<2?`${N}=${Y};`:`${Z(N,ee,s)}=${Y};`,F={},q=(N,ee)=>{_.broadcastedIndicesToOffset=!0;let Y=`${ee.name}broadcastedIndicesTo${e}Offset`;if(Y in F)return`${Y}(${N})`;let j=[];for(let ve=s-1;ve>=0;ve--){let De=ee.indicesGet("outputIndices",ve+ee.rank-s);j.push(`${B(v,ve)} * (${De} % ${B(S,ve)})`)}return F[Y]=`fn ${Y}(outputIndices: ${ee.type.indices}) -> u32 {
             return ${j.length>0?j.join("+"):"0u"};
           }`,`${Y}(${N})`},P=(N,ee)=>(()=>{if(f.storage===f.value)return`${e}[${N}]=${ee};`;if(f.storage==="vec2<u32>"&&f.value==="i32")return`${e}[${N}]=vec2<u32>(u32(${ee}), select(0u, 0xFFFFFFFFu, ${ee} < 0));`;if(f.storage==="vec2<u32>"&&f.value==="u32")return`${e}[${N}]=vec2<u32>(u32(${ee}), 0u);`;if(f.storage==="u32"&&f.value==="vec4<bool>")return`${e}[${N}]=dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(${ee}));`;throw new Error(`not supported combination of storage type ${f.storage} and value type ${f.value} yet`)})(),K=N=>(()=>{if(f.storage===f.value)return`${e}[${N}]`;if(f.storage==="vec2<u32>"&&f.value==="i32")return`i32(${e}[${N}].x)`;if(f.storage==="vec2<u32>"&&f.value==="u32")return`u32(${e}[${N}].x)`;if(f.storage==="u32"&&f.value==="vec4<bool>")return`vec4<bool>(bool(${e}[${N}] & 0xFFu), bool(${e}[${N}] & 0xFF00u), bool(${e}[${N}] & 0xFF0000u), bool(${e}[${N}] & 0xFF000000u))`;throw new Error(`not supported combination of storage type ${f.storage} and value type ${f.value} yet`)})(),O=s<2?"":`
  fn get_${e}ByIndices(indices: ${f.indices}) -> ${h} {
    return ${K(`i2o_${e}(indices)`)};
  }`,U=s<2?"":(()=>{let N=o.map(Y=>`d${Y}: u32`).join(", "),ee=o.map(Y=>`d${Y}`).join(", ");return`
  fn get_${e}(${N}) -> ${h} {
    return get_${e}ByIndices(${$(ee)});
  }`})(),J=(...N)=>{if(N.length!==s)throw new Error(`indices length must be ${s}`);let ee=N.map(y).join(",");return s===0?K("0u"):s===1?K(ee[0]):(_.get=!0,_.getByIndices=!0,_.indicesToOffset=!0,`get_${e}(${ee})`)},re=N=>s<2?K(N):(_.getByIndices=!0,_.indicesToOffset=!0,`get_${e}ByIndices(${N})`),X=s<2?"":`
  fn set_${e}ByIndices(indices: ${f.indices}, value: ${h}) {
    ${P(`i2o_${e}(indices)`,"value")}
  }`,se=s<2?"":(()=>{let N=o.map(Y=>`d${Y}: u32`).join(", "),ee=o.map(Y=>`d${Y}`).join(", ");return`
  fn set_${e}(${N}, value: ${h}) {
    set_${e}ByIndices(${$(ee)}, value);
  }`})();return{impl:()=>{let N=[],ee=!1;return _.offsetToIndices&&(N.push(T),ee=!0),_.indicesToOffset&&(N.push(C),ee=!0),_.broadcastedIndicesToOffset&&(Object.values(F).forEach(Y=>N.push(Y)),ee=!0),_.set&&(N.push(se),ee=!0),_.setByIndices&&(N.push(X),ee=!0),_.get&&(N.push(U),ee=!0),_.getByIndices&&(N.push(O),ee=!0),!a&&ee&&N.unshift(`const ${S} = ${f.indices}(${r.join(",")});`,`const ${v} = ${f.indices}(${R.computeStrides(r).join(",")});`),N.join(`
`)},type:f,offsetToIndices:E,indicesToOffset:z,broadcastedIndicesToOffset:q,indices:$,indicesGet:B,indicesSet:W,set:(...N)=>{if(N.length!==s+1)throw new Error(`indices length must be ${s}`);let ee=N[s];if(typeof ee!="string")throw new Error("value must be string");let Y=N.slice(0,s).map(y).join(",");return s===0?P("0u",ee):s===1?P(Y[0],ee):(_.set=!0,_.setByIndices=!0,_.indicesToOffset=!0,`set_${e}(${Y}, ${ee})`)},setByOffset:P,setByIndices:(N,ee)=>s<2?P(N,ee):(_.setByIndices=!0,_.indicesToOffset=!0,`set_${e}ByIndices(${N}, ${ee});`),get:J,getByOffset:K,getByIndices:re,usage:i,name:e,strides:v,shape:S,rank:s}},D=(e,t,r,i=1)=>gr(e,t,r,"input",i),H=(e,t,r,i=1)=>gr(e,t,r,"output",i),kc=(e,t,r)=>gr(e,t,r,"atomicOutput",1),Ra=(e,t,r,i=1)=>gr(e,t,r,"internal",i),Mu=class{constructor(e,t){this.normalizedDispatchGroup=e,this.limits=t,this.internalVariables=[],this.variables=[],this.uniforms=[],this.variableIndex=0}guardAgainstOutOfBoundsWorkgroupSizes(e){return`if (global_idx >= ${typeof e=="number"?`${e}u`:e}) { return; }`}mainStart(e=Jt){let t=typeof e=="number"?e:e[0],r=typeof e=="number"?1:e[1],i=typeof e=="number"?1:e[2];if(t>this.limits.maxComputeWorkgroupSizeX||r>this.limits.maxComputeWorkgroupSizeY||i>this.limits.maxComputeWorkgroupSizeZ)throw new Error(`workgroup size [${t}, ${r}, ${i}] exceeds the maximum workgroup size [${this.limits.maxComputeWorkgroupSizeX}, ${this.limits.maxComputeWorkgroupSizeY}, ${this.limits.maxComputeWorkgroupSizeZ}].`);if(t*r*i>this.limits.maxComputeInvocationsPerWorkgroup)throw new Error(`workgroup size [${t}, ${r}, ${i}] exceeds the maximum workgroup invocations ${this.limits.maxComputeInvocationsPerWorkgroup}.`);let n=this.normalizedDispatchGroup[1]===1&&this.normalizedDispatchGroup[2]===1,a=n?`@builtin(global_invocation_id) global_id : vec3<u32>,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(local_invocation_id) local_id : vec3<u32>`:`@builtin(global_invocation_id) global_id : vec3<u32>,
                                             @builtin(local_invocation_id) local_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(num_workgroups) num_workgroups : vec3<u32>`,s=n?`let global_idx = global_id.x;
         let workgroup_index = workgroup_id.x;`:`let workgroup_index = workgroup_id.z * num_workgroups[0] * num_workgroups[1] +
             workgroup_id.y * num_workgroups[0] + workgroup_id.x;
         let global_idx = workgroup_index * ${t*r*i}u + local_idx;`;return`@compute @workgroup_size(${t}, ${r}, ${i})
  fn main(${a}) {
    ${s}
  `}appendVariableUniforms(e){e.rank!==0&&(e.shape.startsWith("uniforms.")&&this.uniforms.push({name:e.shape.replace("uniforms.",""),type:"u32",length:e.rank}),e.strides.startsWith("uniforms.")&&this.uniforms.push({name:e.strides.replace("uniforms.",""),type:"u32",length:e.rank}))}declareVariable(e,t){if(e.usage==="internal")throw new Error("cannot use internal variable with declareVariable(). use registerInternalVariables() instead.");this.variables.push(e),this.appendVariableUniforms(e);let r=e.usage==="input"?"read":"read_write",i=e.usage==="atomicOutput"?"atomic<i32>":e.type.storage;return`@group(0) @binding(${t}) var<storage, ${r}> ${e.name}: array<${i}>;`}declareVariables(...e){return e.map(t=>this.declareVariable(t,this.variableIndex++)).join(`
`)}registerInternalVariable(e){if(e.usage!=="internal")throw new Error("cannot use input or output variable with registerInternalVariable(). use declareVariables() instead.");this.internalVariables.push(e),this.appendVariableUniforms(e)}registerInternalVariables(...e){return e.forEach(t=>this.registerInternalVariable(t)),this}registerUniform(e,t,r=1){return this.uniforms.push({name:e,type:t,length:r}),this}registerUniforms(e){return this.uniforms=this.uniforms.concat(e),this}uniformDeclaration(){if(this.uniforms.length===0)return"";let e=[];for(let{name:t,type:r,length:i}of this.uniforms)if(i&&i>4)r==="f16"?e.push(`@align(16) ${t}:array<mat2x4<${r}>, ${Math.ceil(i/8)}>`):e.push(`${t}:array<vec4<${r}>, ${Math.ceil(i/4)}>`);else{let n=i==null||i===1?r:`vec${i}<${r}>`;e.push(`${t}:${n}`)}return`
      struct Uniforms { ${e.join(", ")} };
      @group(0) @binding(${this.variableIndex}) var<uniform> uniforms: Uniforms;`}get additionalImplementations(){return this.uniformDeclaration()+this.variables.map(e=>e.impl()).join(`
`)+this.internalVariables.map(e=>e.impl()).join(`
`)}get variablesInfo(){if(this.uniforms.length===0)return;let e=t=>[12,10,1,6][["u32","f16","f32","i32"].indexOf(t)];return this.uniforms.map(t=>[e(t.type),t.length??1])}},Cc=(e,t)=>new Mu(e,t)}),Bu,xn,Nu,Pu,Lu,Uu,Ue,zc,Oc,Et=L(()=>{"use strict";te(),ne(),Ie(),ae(),Bu=(e,t)=>{if(!e||e.length!==1)throw new Error("Transpose requires 1 input.");if(t.length!==0&&t.length!==e[0].dims.length)throw new Error(`perm size ${t.length} does not match input rank ${e[0].dims.length}`)},xn=(e,t)=>t.length!==0?t:[...new Array(e).keys()].reverse(),Nu=(e,t)=>R.sortBasedOnPerm(e,xn(e.length,t)),Pu=(e,t,r,i)=>{let n=`fn perm(i: ${i.type.indices}) -> ${r.type.indices} {
    var a: ${r.type.indices};`;for(let a=0;a<t;++a)n+=`a[${e[a]}]=i[${a}];`;return n+="return a;}"},Lu=(e,t)=>{let r=[],i=[];for(let n=0;n<e.length;++n)e[n]!==1&&r.push(e[n]),e[t[n]]!==1&&i.push(t[n]);return{newShape:r,newPerm:i}},Uu=(e,t)=>{let r=0;for(let i=0;i<e.length;++i)if(t[e[i]]!==1){if(e[i]<r)return!1;r=e[i]}return!0},Ue=(e,t)=>{let r=e.dataType,i=e.dims.length,n=xn(i,t),a=Nu(e.dims,n),s=e.dims,o=a,l=i<2||Uu(n,e.dims),d;if(l)return d=_=>{let w=D("input",r,s,4),S=H("output",r,o,4);return`
  ${_.registerUniform("output_size","u32").declareVariables(w,S)}
  ${_.mainStart()}
    ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    output[global_idx] = input[global_idx];
  }`},{name:"TransposeCopy",shaderCache:{inputDependencies:["type"]},getRunData:()=>{let _=R.size(a);return{outputs:[{dims:a,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(_/64/4)},programUniforms:[{type:12,data:Math.ceil(_/4)}]}},getShaderSource:d};let{newShape:h,newPerm:c}=Lu(e.dims,n),f=R.areEqual(c,[2,3,1]),y=R.areEqual(c,[3,1,2]);if(h.length===2||f||y){s=f?[h[0],h[1]*h[2]]:y?[h[0]*h[1],h[2]]:h,o=[s[1],s[0]];let _=16;return d=w=>{let S=D("a",r,s.length),v=H("output",r,o.length);return`
  ${w.registerUniform("output_size","u32").declareVariables(S,v)}
  var<workgroup> tile : array<array<${v.type.value}, ${_+1}>, ${_}>;
  ${w.mainStart([_,_,1])}
    let stride = (uniforms.output_shape[1] - 1) / ${_} + 1;
    let workgroup_id_x = workgroup_index % stride;
    let workgroup_id_y = workgroup_index / stride;
    let input_col = workgroup_id_y * ${_}u + local_id.x;
    let input_row = workgroup_id_x * ${_}u + local_id.y;
    if (input_row < uniforms.a_shape[0] && input_col < uniforms.a_shape[1]) {
      tile[local_id.y][local_id.x] = ${S.getByIndices(`${S.type.indices}(input_row, input_col)`)};
    }
    workgroupBarrier();

    let output_col = workgroup_id_x * ${_}u + local_id.x;
    let output_row = workgroup_id_y * ${_}u + local_id.y;
    if (output_row < uniforms.output_shape[0] && output_col < uniforms.output_shape[1]) {
      ${v.setByIndices(`${v.type.indices}(output_row, output_col)`,"tile[local_id.x][local_id.y]")}
    }
  }`},{name:"TransposeShared",shaderCache:{inputDependencies:["type"]},getRunData:()=>{let w=R.size(a);return{outputs:[{dims:a,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(o[1]/_),y:Math.ceil(o[0]/_)},programUniforms:[{type:12,data:w},...Q(s,o)]}},getShaderSource:d}}return d=_=>{let w=D("a",r,s.length),S=H("output",r,o.length);return`
  ${_.registerUniform("output_size","u32").declareVariables(w,S)}

  ${Pu(n,i,w,S)}

  ${_.mainStart()}
    ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let indices = ${S.offsetToIndices("global_idx")};
    let aIndices = perm(indices);

    ${S.setByOffset("global_idx",w.getByIndices("aIndices"))}
  }`},{name:"Transpose",shaderCache:{hint:`${t}`,inputDependencies:["rank"]},getRunData:()=>{let _=R.size(a);return{outputs:[{dims:a,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(_/64)},programUniforms:[{type:12,data:_},...Q(s,o)]}},getShaderSource:d}},zc=(e,t)=>{Bu(e.inputs,t.perm),e.compute(Ue(e.inputs[0],t.perm))},Oc=e=>fe({perm:e.perm})}),Wu,qu,Vu,Gu,Fu,Hu,ju,Ku,Xu,Zu,He,Ac,Rc,Dc,Mc,Bc,Nc,Pc,Lc,Uc,Wc,by=L(()=>{"use strict";te(),ne(),ae(),Da(),Et(),Wu={max:"select(bestValue, candidate, candidate > bestValue)",min:"select(bestValue, candidate, candidate < bestValue)",mean:"bestValue + candidate",sum:"bestValue + candidate",prod:"bestValue * candidate",sumSquare:"bestValue + candidate * candidate",logSumExp:"bestValue + exp(candidate)",l1:"bestValue + abs(candidate)",l2:"bestValue + candidate * candidate",logSum:"bestValue + candidate"},qu={max:"select(bestValue, candidate, candidate > bestValue)",min:"select(bestValue, candidate, candidate < bestValue)",mean:"bestValue + candidate",sum:"bestValue + candidate",prod:"bestValue * candidate",sumSquare:"bestValue + candidate",logSumExp:"bestValue + candidate",l1:"bestValue + candidate",l2:"bestValue + candidate",logSum:"bestValue + candidate"},Vu={max:"_A[offset]",min:"_A[offset]",mean:"0",sum:"0",prod:"1",sumSquare:"0",logSumExp:"0",l1:"0",l2:"0",logSum:"0"},Gu={max:"bestValue",min:"bestValue",sum:"bestValue",prod:"bestValue",sumSquare:"bestValue",logSumExp:"log(bestValue)",l1:"bestValue",l2:"sqrt(bestValue)",logSum:"log(bestValue)"},Fu=(e,t)=>{let r=[];for(let i=t-e;i<t;++i)r.push(i);return r},Hu=(e,t)=>{let r=[],i=e.length;for(let a=0;a<i;a++)t.indexOf(a)===-1&&r.push(e[a]);let n=t.map(a=>e[a]);return[r,n]},ju=(e,t)=>{let r=e.length+t.length,i=[],n=0;for(let a=0;a<r;a++)t.indexOf(a)===-1?i.push(e[n++]):i.push(1);return i},Ku=(e,t)=>{for(let r=0;r<e.length;++r)if(e[e.length-r-1]!==t-1-r)return!1;return!0},Xu=(e,t)=>{let r=[];if(!Ku(e,t)){for(let i=0;i<t;++i)e.indexOf(i)===-1&&r.push(i);e.forEach(i=>r.push(i))}return r},Zu=(e,t,r,i,n,a,s)=>{let o=r[0].dims,l=R.size(a),d=R.size(s),h=D("_A",r[0].dataType,o),c=H("output",n,a),f=64;l===1&&(f=256);let y=`
          var<workgroup> aBestValues : array<f32, ${f}>;
       `,_=w=>`
        ${w.registerUniform("reduceSize","u32").declareVariables(h,c)}
        ${y}
        fn DIV_CEIL(a : u32, b : u32) -> u32 {
          return ((a - 1u) / b + 1u);
         }
         ${w.mainStart(f)}

          let outputIndex = global_idx / ${f};
          let offset = outputIndex * uniforms.reduceSize;

          var bestValue = f32(${Vu[i]});
          let Length = uniforms.reduceSize;
          for (var k = local_idx; k < Length; k = k + ${f}) {
           let candidate = f32(${h.getByOffset("offset + k")});
           bestValue = ${Wu[i]};
          }
          aBestValues[local_idx] = bestValue;
          workgroupBarrier();

         var reduceSize = min(Length, ${f}u);
         for (var currentSize = reduceSize / 2u; reduceSize > 1u;
             currentSize = reduceSize / 2u) {
           let interval = DIV_CEIL(reduceSize, 2u);
           if (local_idx < currentSize) {
            let candidate = aBestValues[local_idx + interval];
            bestValue = ${qu[i]};
            aBestValues[local_idx] = bestValue;
           }
           reduceSize = interval;
           workgroupBarrier();
         }

         if (local_idx == 0u) {
          ${c.setByOffset("outputIndex",`${i==="mean"?`${c.type.storage}(bestValue / f32(uniforms.reduceSize))`:`${c.type.storage}(${Gu[i]})`}`)};
         }
        }`;return{name:e,shaderCache:{hint:`${t};${f}`,inputDependencies:["type"]},getShaderSource:_,getRunData:()=>({outputs:[{dims:a,dataType:n}],dispatchGroup:{x:l},programUniforms:[{type:12,data:d}]})}},He=(e,t,r,i)=>{let n=e.inputs.length===1?r:la(e.inputs,r),a=n.axes;a.length===0&&!n.noopWithEmptyAxes&&(a=e.inputs[0].dims.map((y,_)=>_));let s=R.normalizeAxes(a,e.inputs[0].dims.length),o=s,l=e.inputs[0],d=Xu(o,e.inputs[0].dims.length);d.length>0&&(l=e.compute(Ue(e.inputs[0],d),{inputs:[0],outputs:[-1]})[0],o=Fu(o.length,l.dims.length));let[h,c]=Hu(l.dims,o),f=h;n.keepDims&&(f=ju(h,s)),e.compute(Zu(t,n.cacheKey,[l],i,e.inputs[0].dataType,f,c),{inputs:[l]})},Ac=(e,t)=>{He(e,"ReduceMeanShared",t,"mean")},Rc=(e,t)=>{He(e,"ReduceL1Shared",t,"l1")},Dc=(e,t)=>{He(e,"ReduceL2Shared",t,"l2")},Mc=(e,t)=>{He(e,"ReduceLogSumExpShared",t,"logSumExp")},Bc=(e,t)=>{He(e,"ReduceMaxShared",t,"max")},Nc=(e,t)=>{He(e,"ReduceMinShared",t,"min")},Pc=(e,t)=>{He(e,"ReduceProdShared",t,"prod")},Lc=(e,t)=>{He(e,"ReduceSumShared",t,"sum")},Uc=(e,t)=>{He(e,"ReduceSumSquareShared",t,"sumSquare")},Wc=(e,t)=>{He(e,"ReduceLogSumShared",t,"logSum")}}),je,Yu,fi,la,Ke,Qu,Ju,el,tl,rl,il,nl,al,sl,ol,Xe,qc,Vc,Gc,Fc,Hc,jc,Kc,Xc,Zc,Yc,Da=L(()=>{"use strict";te(),ne(),Ie(),ae(),by(),je=e=>{if(!e||e.length===0||e.length>2)throw new Error("Reduce op requires 1 or 2 inputs.");if(e.length===2&&e[1].dims.length!==1)throw new Error("Invalid axes input dims.")},Yu=e=>["","",`var value = ${e.getByIndices("input_indices")};`,""],fi=(e,t,r,i,n,a,s=!1,o=!1)=>{let l=[],d=r[0].dims,h=d.length,c=R.normalizeAxes(n,h),f=!o&&c.length===0;d.forEach((w,S)=>{f||c.indexOf(S)>=0?s&&l.push(1):l.push(w)});let y=l.length,_=R.size(l);return{name:e,shaderCache:t,getShaderSource:w=>{let S=[],v=D("_A",r[0].dataType,h),b=H("output",a,y),T=i(v,b,c),E=T[2];for(let I=0,C=0;I<h;I++)f||c.indexOf(I)>=0?(s&&C++,E=`for(var j${I}: u32 = 0; j${I} < ${d[I]}; j${I}++) {
                  ${T[2].includes("last_index")?`let last_index = j${I};`:""}
                  ${v.indicesSet("input_indices",I,`j${I}`)}
                  ${E}
                }`):(S.push(`${v.indicesSet("input_indices",I,b.indicesGet("output_indices",C))};`),C++);return`

        ${w.registerUniform("output_size","u32").declareVariables(v,b)}

        ${w.mainStart()}
          ${w.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          var input_indices: ${v.type.indices};
          let output_indices = ${b.offsetToIndices("global_idx")};

          ${S.join(`
`)}
          ${T[0]}       // init ops for reduce max/min
          ${T[1]}
          ${E}
          ${T[3]}
          ${T.length===4?b.setByOffset("global_idx","value"):T.slice(4).join(`
`)}
        }`},getRunData:()=>({outputs:[{dims:l,dataType:a}],dispatchGroup:{x:Math.ceil(_/64)},programUniforms:[{type:12,data:_},...Q(d,l)]})}},la=(e,t)=>{let r=[];return e[1].dims[0]>0&&e[1].getBigInt64Array().forEach(i=>r.push(Number(i))),fe({axes:r,keepDims:t.keepDims,noopWithEmptyAxes:t.noopWithEmptyAxes})},Ke=(e,t,r,i)=>{let n=e.inputs,a=n.length===1?r:la(n,r);e.compute(fi(t,{hint:a.cacheKey,inputDependencies:["rank"]},[n[0]],a.noopWithEmptyAxes&&a.axes.length===0?Yu:i,a.axes,n[0].dataType,a.keepDims,a.noopWithEmptyAxes),{inputs:[0]})},Qu=(e,t)=>{je(e.inputs),Ke(e,"ReduceLogSum",t,(r,i)=>[`var value = ${i.type.storage}(0);`,"",`value += ${r.getByIndices("input_indices")};`,"value = log(value);"])},Ju=(e,t)=>{je(e.inputs),Ke(e,"ReduceL1",t,(r,i)=>[`var value = ${i.type.storage}(0);`,"",`value += abs(${r.getByIndices("input_indices")});`,""])},el=(e,t)=>{je(e.inputs),Ke(e,"ReduceL2",t,(r,i)=>[`var t = ${i.type.value}(0); var value = ${i.type.value}(0);`,"",`t = ${r.getByIndices("input_indices")}; value += (t * t);`,"value = sqrt(value);"])},tl=(e,t)=>{je(e.inputs),Ke(e,"ReduceLogSumExp",t,(r,i)=>[`var value = ${i.type.storage}(0);`,"",`value += exp(${r.getByIndices("input_indices")});`,"value = log(value);"])},rl=(e,t)=>{je(e.inputs),Ke(e,"ReduceMax",t,(r,i,n)=>{let a=[];for(let s=0;s<r.rank;s++)(n.indexOf(s)>=0||n.length===0)&&a.push(r.indicesSet("input_indices",s,0));return[`${a.join(`
`)}`,`var value = ${r.getByIndices("input_indices")};`,`value = max(value, ${r.getByIndices("input_indices")});`,""]})},il=(e,t)=>{je(e.inputs),Ke(e,"ReduceMean",t,(r,i,n)=>{let a=1;for(let s=0;s<r.rank;s++)(n.indexOf(s)>=0||n.length===0)&&(a*=e.inputs[0].dims[s]);return["var sum = f32(0);","",`sum += f32(${r.getByIndices("input_indices")});`,`let value = ${i.type.value}(sum / ${a});`]})},nl=(e,t)=>{je(e.inputs),Ke(e,"ReduceMin",t,(r,i,n)=>{let a=[];for(let s=0;s<r.rank;s++)(n.indexOf(s)>=0||n.length===0)&&a.push(`input_indices[${s}] = 0;`);return[`${a.join(`
`)}`,`var value = ${r.getByIndices("input_indices")};`,`value = min(value, ${r.getByIndices("input_indices")});`,""]})},al=(e,t)=>{je(e.inputs),Ke(e,"ReduceProd",t,(r,i)=>[`var value = ${i.type.storage}(1);`,"",`value *= ${r.getByIndices("input_indices")};`,""])},sl=(e,t)=>{je(e.inputs),Ke(e,"ReduceSum",t,(r,i)=>[`var value = ${i.type.storage}(0);`,"",`value += ${r.getByIndices("input_indices")};`,""])},ol=(e,t)=>{je(e.inputs),Ke(e,"ReduceSumSquare",t,(r,i)=>[`var t = ${i.type.value}(0); var value = ${i.type.value}(0);`,"",`t = ${r.getByIndices("input_indices")}; value += t * t;`,""])},Xe=(e,t,r)=>{if(t.length===0)return r;let i=1,n=1;for(let a=0;a<t.length;a++)t.indexOf(a)===-1?i*=e[a]:n*=e[a];return n<32&&i>1024},qc=(e,t)=>{Xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?il(e,t):Ac(e,t)},Vc=(e,t)=>{Xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Ju(e,t):Rc(e,t)},Gc=(e,t)=>{Xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?el(e,t):Dc(e,t)},Fc=(e,t)=>{Xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?tl(e,t):Mc(e,t)},Hc=(e,t)=>{Xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?rl(e,t):Bc(e,t)},jc=(e,t)=>{Xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?nl(e,t):Nc(e,t)},Kc=(e,t)=>{Xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?al(e,t):Pc(e,t)},Xc=(e,t)=>{Xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?sl(e,t):Lc(e,t)},Zc=(e,t)=>{Xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?ol(e,t):Uc(e,t)},Yc=(e,t)=>{Xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Qu(e,t):Wc(e,t)}}),Sn,Qc,Jc,da,wy=L(()=>{"use strict";te(),Ie(),Da(),Sn=e=>{if(!e||e.length===0||e.length>2)throw new Error("ArgMinMaxOp op requires 1 or 2 inputs.");if(e[0].dataType!==1)throw new Error("Invalid input type.")},Qc=(e,t)=>{Sn(e.inputs);let r=(i,n,a)=>{let s=[];for(let o=0;o<i.rank;o++)(a.indexOf(o)>=0||a.length===0)&&s.push(`input_indices[${o}] = 0;`);return[`${s.join(`
`)}`,`var value = ${i.getByIndices("input_indices")};
var best_index : i32 = 0;`,`if (${i.getByIndices("input_indices")} ${t.selectLastIndex>0?"<=":"<"} value) {
         value = ${i.getByIndices("input_indices")};
         best_index = i32(last_index);
       }`,"",n.setByOffset("global_idx","best_index")]};e.compute(fi("ArgMin",{hint:t.cacheKey,inputDependencies:["rank"]},[e.inputs[0]],r,[t.axis],7,t.keepDims),{inputs:[0]})},Jc=(e,t)=>{Sn(e.inputs);let r=(i,n,a)=>{let s=[];for(let o=0;o<i.rank;o++)(a.indexOf(o)>=0||a.length===0)&&s.push(`input_indices[${o}] = 0;`);return[`${s.join(`
`)}`,`var value = ${i.getByIndices("input_indices")};
var best_index : i32 = 0;`,`if (${i.getByIndices("input_indices")} ${t.selectLastIndex>0?">=":">"} value) {
         value = ${i.getByIndices("input_indices")};
         best_index = i32(last_index);
       }`,"",n.setByOffset("global_idx","best_index")]};e.compute(fi("argMax",{hint:t.cacheKey,inputDependencies:["rank"]},[e.inputs[0]],r,[t.axis],7,t.keepDims),{inputs:[0]})},da=e=>fe(e)}),ul,ti,ll,dl,pl,zr,cl,eh,Ma=L(()=>{"use strict";te(),ne(),Aa(),ae(),ul=(e,t)=>{let r=e[0],i=e[1],n=e[2],a=e[3],s=e[4],o=e[5];if(s&&o)throw new Error("Attention cannot have both past and attention_bias");if(r.dims.length!==3)throw new Error('Input "input" must have 3 dimensions');let l=r.dims[0],d=r.dims[1],h=r.dims[2];if(n.dims.length!==1)throw new Error('Input "bias" is expected to have 1 dimensions');if(i.dims.length!==2)throw new Error('Input "weights" is expected to have 2 dimensions');if(i.dims[0]!==h)throw new Error("Input 1 dimension 0 should have same length as dimension 2 of input 0");if(n.dims[0]!==i.dims[1])throw new Error('Input "bias" dimension 0 should have same length as dimension 1 of input "weights"');let c=n.dims[0]/3,f=c,y=f;if(t.qkvHiddenSizes.length>0){if(t.qkvHiddenSizes.length!==3)throw new Error("qkv_hidden_sizes attribute should have 3 elements");for(let T of t.qkvHiddenSizes)if(T%t.numHeads!==0)throw new Error("qkv_hidden_sizes should be divisible by num_heads");c=t.qkvHiddenSizes[0],f=t.qkvHiddenSizes[1],y=t.qkvHiddenSizes[2]}let _=d;if(c!==f)throw new Error("qkv_hidden_sizes first element should be same as the second");if(n.dims[0]!==c+f+y)throw new Error('Input "bias" dimension 0 should have same length as sum of Q/K/V hidden sizes');let w=0;if(s){if(f!==y)throw new Error('Input "past" expect k_hidden_size == v_hidden_size');if(s.dims.length!==5)throw new Error('Input "past" must have 5 dimensions');if(s.dims[0]!==2)throw new Error('Input "past" first dimension must be 2');if(s.dims[1]!==l)throw new Error('Input "past" second dimension must be batch_size');if(s.dims[2]!==t.numHeads)throw new Error('Input "past" third dimension must be num_heads');if(s.dims[4]!==f/t.numHeads)throw new Error('Input "past" fifth dimension must be k_hidden_size / num_heads');t.pastPresentShareBuffer||(w=s.dims[3])}let S=_+w,v=-1,b=0;if(a)throw new Error("Mask not supported");if(s)throw new Error("past is not supported");if(o){if(o.dims.length!==4)throw new Error('Input "attention_bias" must have 4 dimensions');if(o.dims[0]!==l||o.dims[1]!==t.numHeads||o.dims[2]!==d||o.dims[3]!==S)throw new Error('Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)')}return{batchSize:l,sequenceLength:d,pastSequenceLength:w,kvSequenceLength:_,totalSequenceLength:S,maxSequenceLength:v,inputHiddenSize:h,hiddenSize:c,vHiddenSize:y,headSize:Math.floor(c/t.numHeads),vHeadSize:Math.floor(y/t.numHeads),numHeads:t.numHeads,isUnidirectional:!1,pastPresentShareBuffer:!1,maskFilterValue:t.maskFilterValue,maskType:b,scale:t.scale,broadcastResPosBias:!1,passPastInKv:!1,qkvFormat:1}},ti=(e,t,r)=>t&&e?`
      let total_sequence_length_input = u32(${t.getByOffset("0")});
      let present_sequence_length = max(total_sequence_length_input, uniforms.past_sequence_length);
      let is_subsequent_prompt: bool = sequence_length > 1 && sequence_length != total_sequence_length_input;
      let is_first_prompt: bool = is_subsequent_prompt == false && sequence_length == total_sequence_length_input;
      total_sequence_length = u32(${e?.getByOffset("batchIdx")}) + 1;
      var past_sequence_length: u32 = 0;
      if (is_first_prompt == false) {
        past_sequence_length = total_sequence_length - sequence_length;
      }
       `:`
    ${r?"let past_sequence_length = uniforms.past_sequence_length":""};
    let present_sequence_length = total_sequence_length;
    `,ll=(e,t,r,i,n,a,s,o)=>{let l=Ee(s?1:a),d=64,h=a/l;h<d&&(d=32);let c=Math.ceil(a/l/d),f=[{type:12,data:t},{type:12,data:r},{type:12,data:i},{type:12,data:n},{type:12,data:h},{type:12,data:c}],y=ze(e.dataType,l),_=Ce(1,l),w=["type"];s&&w.push("type"),o&&w.push("type");let S=v=>{let b=H("x",e.dataType,e.dims,l),T=[b],E=s?D("seq_lens",s.dataType,s.dims):void 0;E&&T.push(E);let I=o?D("total_sequence_length_input",o.dataType,o.dims):void 0;I&&T.push(I);let C=Ce(e.dataType),z=[{name:"batch_size",type:"u32"},{name:"num_heads",type:"u32"},{name:"past_sequence_length",type:"u32"},{name:"sequence_length",type:"u32"},{name:"total_sequence_length",type:"u32"},{name:"elements_per_thread",type:"u32"}];return`
  var<workgroup> thread_max: array<f32, ${d}>;
  var<workgroup> thread_sum: array<f32, ${d}>;
  ${v.registerUniforms(z).declareVariables(...T)}
  ${v.mainStart([d,1,1])}
    let batchIdx = workgroup_id.z / uniforms.num_heads;
    let headIdx = workgroup_id.z % uniforms.num_heads;
    let sequence_length = uniforms.sequence_length;
    var total_sequence_length = uniforms.total_sequence_length;
    ${ti(E,I,!1)}
    let local_offset = local_idx * uniforms.elements_per_thread;
    let offset = (global_idx / ${d}) * uniforms.total_sequence_length + local_offset;
    let seq_causal_length = ${s?"u32(past_sequence_length + workgroup_id.y + 1)":"total_sequence_length"};
    var thread_max_vector = ${_}(-3.4028234663852886e+38f);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
      thread_max_vector = max(${_}(x[offset + i]), thread_max_vector);
    }
    thread_max[local_idx] = ${(()=>{switch(l){case 1:return"thread_max_vector";case 2:return"max(thread_max_vector.x, thread_max_vector.y)";case 4:return"max(max(thread_max_vector.x, thread_max_vector.y), max(thread_max_vector.z, thread_max_vector.w))";default:throw new Error(`Unsupported components: ${l}`)}})()};
    workgroupBarrier();

    var max_value =  f32(-3.4028234663852886e+38f);
    for (var i = 0u; i < ${d}; i++) {
      max_value = max(thread_max[i], max_value);
    }

    var sum_vector = ${_}(0);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
      sum_vector += exp(${_}(x[offset + i]) - max_value);
    }
    thread_sum[local_idx] = ${(()=>{switch(l){case 1:return"sum_vector";case 2:return"sum_vector.x + sum_vector.y";case 4:return"sum_vector.x + sum_vector.y + sum_vector.z + sum_vector.w";default:throw new Error(`Unsupported components: ${l}`)}})()};
    workgroupBarrier();

    var sum: f32 = 0;
    for (var i = 0u; i < ${d}; i++) {
      sum += thread_sum[i];
    }

    if (sum == 0) {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
        x[offset + i] = ${b.type.value}(${C}(1.0) / ${C}(seq_causal_length));
      }
    } else {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
        var f32input = ${_}(x[offset + i]);
        x[offset + i] = ${b.type.value}(exp(f32input - max_value) / sum);
      }
    }
      ${s?`
        for (var total_seq_id: u32 = seq_causal_length; total_seq_id + local_offset < uniforms.total_sequence_length; total_seq_id++) {
          x[offset + total_seq_id] = ${b.type.value}(${C}(0));
        }`:""};
  }`};return{name:"AttentionProbsSoftmax",shaderCache:{hint:`${d};${y};${l}`,inputDependencies:w},getShaderSource:S,getRunData:()=>({outputs:[],dispatchGroup:{x:1,y:n,z:t*r},programUniforms:f})}},dl=(e,t,r,i,n,a,s,o,l)=>{let d=s+a.kvSequenceLength,h=[a.batchSize,a.numHeads,a.sequenceLength,d],c=e>1&&i,f=a.kvNumHeads?a.kvNumHeads:a.numHeads,y=c?[a.batchSize,f,d,a.headSize]:void 0,_=a.nReps?a.nReps:1,w=a.scale===0?1/Math.sqrt(a.headSize):a.scale,S=Ee(a.headSize),v=a.headSize/S,b=12,T={x:Math.ceil(d/b),y:Math.ceil(a.sequenceLength/b),z:a.batchSize*a.numHeads},E=[{type:12,data:a.sequenceLength},{type:12,data:v},{type:12,data:d},{type:12,data:a.numHeads},{type:12,data:a.headSize},{type:1,data:w},{type:12,data:s},{type:12,data:a.kvSequenceLength},{type:12,data:_}],I=c&&i&&R.size(i.dims)>0,C=["type","type"];I&&C.push("type"),n&&C.push("type"),o&&C.push("type"),l&&C.push("type");let z=[{dims:h,dataType:t.dataType,gpuDataType:0}];c&&z.push({dims:y,dataType:t.dataType,gpuDataType:0});let $=B=>{let W=D("q",t.dataType,t.dims,S),F=D("key",r.dataType,r.dims,S),q=[W,F];if(I){let X=D("past_key",i.dataType,i.dims,S);q.push(X)}n&&q.push(D("attention_bias",n.dataType,n.dims));let P=o?D("seq_lens",o.dataType,o.dims):void 0;P&&q.push(P);let K=l?D("total_sequence_length_input",l.dataType,l.dims):void 0;K&&q.push(K);let O=H("output",t.dataType,h),U=[O];c&&U.push(H("present_key",t.dataType,y,S));let J=Ce(1,S),re=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"alpha",type:"f32"},{name:"past_sequence_length",type:"u32"},{name:"kv_sequence_length",type:"u32"},{name:"n_reps",type:"u32"}];return`
  const TILE_SIZE = ${b}u;

  var<workgroup> tileQ: array<${W.type.storage}, ${b*b}>;
  var<workgroup> tileK: array<${W.type.storage}, ${b*b}>;
  ${B.registerUniforms(re).declareVariables(...q,...U)}
  ${B.mainStart([b,b,1])}
    // x holds the N and y holds the M
    let headIdx = workgroup_id.z % uniforms.num_heads;
    let kvHeadIdx = ${_===1?"headIdx":"headIdx / uniforms.n_reps"};
    let kv_num_heads = ${_===1?"uniforms.num_heads":"uniforms.num_heads / uniforms.n_reps"};
    let batchIdx = workgroup_id.z / uniforms.num_heads;
    let m = workgroup_id.y * TILE_SIZE;
    let n = workgroup_id.x * TILE_SIZE;
    let sequence_length = uniforms.M;
    var total_sequence_length = uniforms.N;
    ${ti(P,K,!0)}
    let absKvHeadIdx = batchIdx * kv_num_heads + kvHeadIdx;
    let qOffset = workgroup_id.z * uniforms.M * uniforms.K + m * uniforms.K;
    ${I&&c?"let pastKeyOffset = absKvHeadIdx * uniforms.past_sequence_length * uniforms.K;":""};
    let kOffset = absKvHeadIdx * uniforms.kv_sequence_length * uniforms.K;
    ${c?"let presentKeyOffset = absKvHeadIdx * uniforms.N * uniforms.K;":""}
    var value = ${J}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (global_id.y < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = q[qOffset + local_id.y * uniforms.K + w + local_id.x];
      }
      if (n + local_id.y < uniforms.N && w + local_id.x < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
      ${I&&c?`
              if (n + local_id.y < past_sequence_length) {
                tileK[idx] = past_key[pastKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x];
              } else if (n + local_id.y - past_sequence_length < uniforms.kv_sequence_length) {
                tileK[idx] = key[kOffset + (n + local_id.y - past_sequence_length) * uniforms.K + w + local_id.x];
              }`:`
          if (n + local_id.y < uniforms.kv_sequence_length) {
            tileK[idx] = key[kOffset + (n + local_id.y) * uniforms.K + w + local_id.x];
          }`}
      ${c?`if (n + local_id.y < present_sequence_length) {
        present_key[presentKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x] = tileK[idx];
      }`:""}
      }
      workgroupBarrier();

      for (var k: u32 = 0u; k < TILE_SIZE && w+k < uniforms.K; k++) {
          value += ${J}(tileQ[TILE_SIZE * local_id.y + k] * tileK[TILE_SIZE * local_id.x + k]);
      }

      workgroupBarrier();
    }

    if (global_id.y < uniforms.M && global_id.x < total_sequence_length) {
      let headOffset = workgroup_id.z * uniforms.M * uniforms.N;
      let outputIdx = headOffset + global_id.y * uniforms.N + global_id.x;
      var sum: f32 = ${(()=>{switch(S){case 1:return"value";case 2:return"value.x + value.y";case 4:return"value.x + value.y + value.z + value.w";default:throw new Error(`Unsupported components: ${S}`)}})()};
        output[outputIdx] = ${O.type.value} (sum * uniforms.alpha) + ${n?"attention_bias[outputIdx]":"0.0"};
    }
  }`};return{name:"AttentionProbs",shaderCache:{hint:`${S};${n!==void 0};${i!==void 0};${e}`,inputDependencies:C},getRunData:()=>({outputs:z,dispatchGroup:T,programUniforms:E}),getShaderSource:$}},pl=(e,t,r,i,n,a,s=void 0,o=void 0)=>{let l=a+n.kvSequenceLength,d=n.nReps?n.nReps:1,h=n.vHiddenSize*d,c=e>1&&i,f=n.kvNumHeads?n.kvNumHeads:n.numHeads,y=c?[n.batchSize,f,l,n.headSize]:void 0,_=[n.batchSize,n.sequenceLength,h],w=12,S={x:Math.ceil(n.vHeadSize/w),y:Math.ceil(n.sequenceLength/w),z:n.batchSize*n.numHeads},v=[{type:12,data:n.sequenceLength},{type:12,data:l},{type:12,data:n.vHeadSize},{type:12,data:n.numHeads},{type:12,data:n.headSize},{type:12,data:h},{type:12,data:a},{type:12,data:n.kvSequenceLength},{type:12,data:d}],b=c&&i&&R.size(i.dims)>0,T=["type","type"];b&&T.push("type"),s&&T.push("type"),o&&T.push("type");let E=[{dims:_,dataType:t.dataType,gpuDataType:0}];c&&E.push({dims:y,dataType:t.dataType,gpuDataType:0});let I=C=>{let z=D("probs",t.dataType,t.dims),$=D("v",r.dataType,r.dims),B=[z,$];b&&B.push(D("past_value",i.dataType,i.dims));let W=s?D("seq_lens",s.dataType,s.dims):void 0;s&&B.push(W);let F=o?D("total_sequence_length_input",o.dataType,o.dims):void 0;o&&B.push(F);let q=[H("output",t.dataType,_)];c&&q.push(H("present_value",t.dataType,y));let P=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"v_hidden_size",type:"u32"},{name:"past_sequence_length",type:"u32"},{name:"kv_sequence_length",type:"u32"},{name:"n_reps",type:"u32"}];return`
  const TILE_SIZE = ${w}u;
  var<workgroup> tileQ: array<${z.type.value}, ${w*w}>;
  var<workgroup> tileV: array<${z.type.value}, ${w*w}>;
  ${C.registerUniforms(P).declareVariables(...B,...q)}
  ${C.mainStart([w,w,1])}
   let headIdx = workgroup_id.z % uniforms.num_heads;
   let batchIdx = workgroup_id.z / uniforms.num_heads;
   let kvHeadIdx = ${d===1?"headIdx":"headIdx / uniforms.n_reps"};
   let kv_num_heads = ${d===1?"uniforms.num_heads":"uniforms.num_heads / uniforms.n_reps"};
   let m = global_id.y;
   let n = global_id.x;
   let sequence_length = uniforms.M;
   var total_sequence_length = uniforms.K;
   ${ti(W,F,!0)}
   let offsetA = workgroup_id.z * uniforms.M * uniforms.K + m * uniforms.K;
   let absKvHeadIdx = batchIdx * kv_num_heads + kvHeadIdx; // kvHeadIdx is relative to the batch
   ${b&&c?"let pastValueOffset = absKvHeadIdx * uniforms.N * uniforms.past_sequence_length + n;":""};
   let vOffset = absKvHeadIdx * uniforms.N * uniforms.kv_sequence_length + n;
   ${c?"let presentValueOffset = absKvHeadIdx * uniforms.N * uniforms.K + n;":""}
   var value = ${z.type.storage}(0);
   for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = probs[offsetA + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
        ${b&&c?`
        if (w + local_id.y < past_sequence_length) {
          tileV[idx] = past_value[pastValueOffset + (w + local_id.y) * uniforms.N];
        } else if (w + local_id.y - past_sequence_length < uniforms.kv_sequence_length) {
          tileV[idx] = v[vOffset + (w + local_id.y - past_sequence_length) * uniforms.N];
        }
      `:`
            if (w + local_id.y < uniforms.kv_sequence_length) {
              tileV[idx] = v[vOffset + (w + local_id.y) * uniforms.N];
            }`}
        ${c?`
            if (w + local_id.y < present_sequence_length) {
          present_value[presentValueOffset + (w + local_id.y) * uniforms.N] = tileV[idx];
        }`:""}
      }
     workgroupBarrier();
     for (var k: u32 = 0u; k < TILE_SIZE && w+k < total_sequence_length; k++) {
       value += tileQ[TILE_SIZE * local_id.y + k] * tileV[TILE_SIZE * k + local_id.x];
     }
     workgroupBarrier();
   }

   // we need to transpose output from BNSH_v to BSND_v
   if (m < uniforms.M && n < uniforms.N) {
     let outputIdx = batchIdx * uniforms.M * uniforms.v_hidden_size + m * uniforms.v_hidden_size
       + headIdx * uniforms.N + n;
     output[outputIdx] = value;
   }
  }`};return{name:"AttentionScore",shaderCache:{hint:`${i!==void 0};${e}`,inputDependencies:T},getRunData:()=>({outputs:E,dispatchGroup:S,programUniforms:v}),getShaderSource:I}},zr=(e,t,r,i,n,a,s,o,l,d,h=void 0,c=void 0)=>{let f=Math.min(e.outputCount,1+(s?1:0)+(o?1:0)),y=f>1?s:void 0,_=f>1?o:void 0,w=f>1?d.pastSequenceLength:0,S=w+d.kvSequenceLength,v=l&&R.size(l.dims)>0?l:void 0,b=[t,r];y&&R.size(y.dims)>0&&b.push(y),v&&b.push(v),h&&b.push(h),c&&b.push(c);let T=e.compute(dl(f,t,r,y,v,d,w,h,c),{inputs:b,outputs:f>1?[-1,1]:[-1]})[0];e.compute(ll(T,d.batchSize,d.numHeads,w,d.sequenceLength,S,h,c),{inputs:h&&c?[T,h,c]:[T],outputs:[]});let E=[T,i];_&&R.size(_.dims)>0&&E.push(_),h&&E.push(h),c&&E.push(c),e.compute(pl(f,T,i,_,d,w,h,c),{inputs:E,outputs:f>1?[0,2]:[0]})},cl=(e,t)=>{let r=[t.batchSize,t.numHeads,t.sequenceLength,t.headSize],i=t.sequenceLength,n=t.inputHiddenSize,a=t.headSize,s=12,o={x:Math.ceil(t.headSize/s),y:Math.ceil(t.sequenceLength/s),z:t.batchSize*t.numHeads},l=[e.inputs[0],e.inputs[1],e.inputs[2]],d=[{type:12,data:i},{type:12,data:n},{type:12,data:a},{type:12,data:t.numHeads},{type:12,data:t.headSize},{type:12,data:t.hiddenSize},{type:12,data:t.hiddenSize+t.hiddenSize+t.vHiddenSize}],h=c=>{let f=H("output_q",l[0].dataType,r),y=H("output_k",l[0].dataType,r),_=H("output_v",l[0].dataType,r),w=D("input",l[0].dataType,l[0].dims),S=D("weight",l[1].dataType,l[1].dims),v=D("bias",l[2].dataType,l[2].dims),b=w.type.storage,T=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"hidden_size",type:"u32"},{name:"ldb",type:"u32"}];return`
  const TILE_SIZE = ${s}u;
  var<workgroup> tileInput: array<${b}, ${s*s}>;
  var<workgroup> tileWeightQ: array<${b}, ${s*s}>;
  var<workgroup> tileWeightK: array<${b}, ${s*s}>;
  var<workgroup> tileWeightV: array<${b}, ${s*s}>;
  ${c.registerUniforms(T).declareVariables(w,S,v,f,y,_)}
  ${c.mainStart([s,s,1])}
    let batchIndex = workgroup_id.z / uniforms.num_heads;
    let headNumber = workgroup_id.z % uniforms.num_heads;
    let m = global_id.y;
    let n = global_id.x;

    let inputOffset = batchIndex * (uniforms.M * uniforms.K) + m * uniforms.K;
    let biasOffsetQ = headNumber * uniforms.head_size;
    let biasOffsetK = uniforms.hidden_size + biasOffsetQ;
    let biasOffsetV = uniforms.hidden_size + biasOffsetK;

    var valueQ = ${b}(0);
    var valueK = ${b}(0);
    var valueV = ${b}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileInput[TILE_SIZE * local_id.y + local_id.x] = input[inputOffset + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        let offset = n + (w + local_id.y) * uniforms.ldb;
        tileWeightQ[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetQ + offset];
        tileWeightK[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetK + offset];
        tileWeightV[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetV + offset];
      }
      workgroupBarrier();
      for (var k: u32 = 0u; k<TILE_SIZE && w+k < uniforms.K; k++) {
        let inputTileOffset = TILE_SIZE * local_id.y + k;
        let weightTileOffset = TILE_SIZE * k + local_id.x;
        valueQ += tileInput[inputTileOffset] * tileWeightQ[weightTileOffset];
        valueK += tileInput[inputTileOffset] * tileWeightK[weightTileOffset];
        valueV += tileInput[inputTileOffset] * tileWeightV[weightTileOffset];
      }

      workgroupBarrier();
    }

    let headOffset = (m * uniforms.N + n) % uniforms.head_size;
    valueQ += bias[headOffset + biasOffsetQ];
    valueK += bias[headOffset + biasOffsetK];
    valueV += bias[headOffset + biasOffsetV];

    let offset = workgroup_id.z * uniforms.M * uniforms.N;
    if (m < uniforms.M && n < uniforms.N) {
      let outputIdx = offset + m * uniforms.N + n;
      output_q[outputIdx] = valueQ;
      output_k[outputIdx] = valueK;
      output_v[outputIdx] = valueV;
    }
  }`};return e.compute({name:"AttentionPrepare",shaderCache:{inputDependencies:["type","type","type"]},getRunData:()=>({outputs:[{dims:r,dataType:e.inputs[0].dataType,gpuDataType:0},{dims:r,dataType:e.inputs[0].dataType,gpuDataType:0},{dims:r,dataType:e.inputs[0].dataType,gpuDataType:0}],dispatchGroup:o,programUniforms:d}),getShaderSource:h},{inputs:l,outputs:[-1,-1,-1]})},eh=(e,t)=>{let r=ul(e.inputs,t),[i,n,a]=cl(e,r);return zr(e,i,n,a,e.inputs[4],void 0,void 0,void 0,e.inputs[5],r)}}),hl,fl,ml,th,vy=L(()=>{"use strict";Ge(),te(),ne(),Ie(),ae(),hl=(e,t)=>{if(!e||e.length!==5)throw new Error("BatchNormalization requires 5 inputs");let r=(i,n,a)=>{let s=n.length;if(s!==i.length)throw new Error(`${a}: num dimensions != ${s}`);n.forEach((o,l)=>{if(o!==i[l])throw new Error(`${a}: dim[${l}] do not match`)})};if(e[0].dims.length>1){let i=t.format==="NHWC"?t.spatial?e[0].dims.slice(-1):e[0].dims.slice(-1).concat(e[0].dims.slice(1,e[0].dims.length-1)):e[0].dims.slice(1,t.spatial?2:void 0);r(e[1].dims,i,"Invalid input scale"),r(e[2].dims,i,"Invalid input B"),r(e[3].dims,i,"Invalid input mean"),r(e[4].dims,i,"Invalid input var")}else r(e[1].dims,[1],"Invalid input scale"),r(e[2].dims,[1],"Invalid input B"),r(e[3].dims,[1],"Invalid input mean"),r(e[4].dims,[1],"Invalid input var")},fl=(e,t)=>{let{epsilon:r,spatial:i,format:n}=t,a=e[0].dims,s=i?Ee(a[a.length-1]):1,o=n==="NHWC"&&a.length>1?s:1,l=R.size(a)/s,d=i,h=d?a.length:a,c=D("x",e[0].dataType,e[0].dims,s),f=D("scale",e[1].dataType,e[1].dims,o),y=D("bias",e[2].dataType,e[2].dims,o),_=D("inputMean",e[3].dataType,e[3].dims,o),w=D("inputVar",e[4].dataType,e[4].dims,o),S=H("y",e[0].dataType,h,s),v=()=>{let T="";if(i)T=`let cOffset = ${a.length===1?"0u":n==="NHWC"?`outputIndices[${a.length-1}] / ${s}`:"outputIndices[1]"};`;else if(n==="NCHW")T=`
            ${S.indicesSet("outputIndices","0","0")}
            let cOffset = ${S.indicesToOffset("outputIndices")};`;else{T=`var cIndices = ${f.type.indices}(0);
                       cIndices[0] = outputIndices[${a.length-1}];`;for(let E=1;E<f.rank;E++)T+=`cIndices[${E}] = outputIndices[${E}];`;T+=`let cOffset = ${f.indicesToOffset("cIndices")};`}return T},b=T=>`
  const epsilon = ${r};
  ${T.registerUniform("outputSize","u32").declareVariables(c,f,y,_,w,S)}
  ${T.mainStart()}
  ${T.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
    var outputIndices = ${S.offsetToIndices(`global_idx * ${s}`)};
    ${v()}
    let scale = ${f.getByOffset("cOffset")};
    let bias = ${y.getByOffset("cOffset")};
    let inputMean = ${_.getByOffset("cOffset")};
    let inputVar = ${w.getByOffset("cOffset")};
    let x = ${c.getByOffset("global_idx")};
    let value = (x - inputMean) * inverseSqrt(inputVar + epsilon) * scale + bias;
    ${S.setByOffset("global_idx","value")}
  }`;return{name:"BatchNormalization",shaderCache:{hint:`${t.epsilon}_${t.format}_${i}_${s}`,inputDependencies:d?["rank","type","type","type","type"]:void 0},getShaderSource:b,getRunData:()=>({outputs:[{dims:e[0].dims,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:d?[{type:12,data:l},...Q(a)]:[{type:12,data:l}]})}},ml=e=>fe(e),th=(e,t)=>{let{inputs:r,outputCount:i}=e,n=ml({...t,outputCount:i});if(ge.webgpu.validateInputContent&&hl(r,n),t.trainingMode)throw new Error("BatchNormalization trainingMode is not supported yet.");e.compute(fl(r,n))}}),gl,_l,rh,$y=L(()=>{"use strict";ne(),ae(),gl=e=>{if(e[0].dims.length!==3)throw new Error("input should have 3 dimensions");if(![320,640,1280].includes(e[0].dims[2]))throw new Error("number of channels should be 320, 640 or 1280");if(e[1].dims.length!==1)throw new Error("bias is expected to have 1 dimensions");if(e[0].dims[2]!==e[1].dims[0])throw new Error("last dimension of input and bias are not the same")},_l=e=>{let t=e[0].dims,r=e[0].dims[2],i=R.size(t)/4,n=e[0].dataType,a=D("input",n,t,4),s=D("bias",n,[r],4),o=D("residual",n,t,4),l=H("output",n,t,4);return{name:"BiasAdd",getRunData:()=>({outputs:[{dims:t,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(i/64)}}),getShaderSource:d=>`
  const channels = ${r}u / 4;
  ${d.declareVariables(a,s,o,l)}

  ${d.mainStart()}
    ${d.guardAgainstOutOfBoundsWorkgroupSizes(i)}
    let value = ${a.getByOffset("global_idx")}
      + ${s.getByOffset("global_idx % channels")} + ${o.getByOffset("global_idx")};
    ${l.setByOffset("global_idx","value")}
  }`}},rh=e=>{gl(e.inputs),e.compute(_l(e.inputs))}}),yl,he,ih,nh,ah,sh,oh,uh,lh,dh,ph,bl,ch,hh,fh,mh,Tr,gh,di,_h,yh,bh,wh,vh,$h,xh,Sh,Th,Eh,Ih,kh,Ch,zh,Oh,Ah,Rh,Tn,Dh,pa,ca,Mh,Bh,Nh,wl,vl,Ph,Ba=L(()=>{"use strict";te(),ne(),Ie(),ae(),yl=(e,t,r,i,n,a,s)=>{let o=Math.ceil(t/4),l="";typeof n=="string"?l=`${n}(a)`:l=n("a");let d=D("inputData",r,[o],4),h=H("outputData",i,[o],4),c=[{name:"vec_size",type:"u32"}];return s&&c.push(...s),`
      ${e.registerUniforms(c).declareVariables(d,h)}

  ${a??""}

  ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}

    let a = ${d.getByOffset("global_idx")};
    ${h.setByOffset("global_idx",l)}
  }`},he=(e,t,r,i,n,a=e.dataType,s,o)=>{let l=[{type:12,data:Math.ceil(R.size(e.dims)/4)}];return s&&l.push(...s),{name:t,shaderCache:{hint:n,inputDependencies:["type"]},getShaderSource:d=>yl(d,R.size(e.dims),e.dataType,a,r,i,o),getRunData:d=>({outputs:[{dims:e.dims,dataType:a}],dispatchGroup:{x:Math.ceil(R.size(d[0].dims)/64/4)},programUniforms:l})}},ih=e=>{e.compute(he(e.inputs[0],"Abs","abs"))},nh=e=>{e.compute(he(e.inputs[0],"Acos","acos"))},ah=e=>{e.compute(he(e.inputs[0],"Acosh","acosh"))},sh=e=>{e.compute(he(e.inputs[0],"Asin","asin"))},oh=e=>{e.compute(he(e.inputs[0],"Asinh","asinh"))},uh=e=>{e.compute(he(e.inputs[0],"Atan","atan"))},lh=e=>{e.compute(he(e.inputs[0],"Atanh","atanh"))},dh=e=>fe(e),ph=(e,t)=>{let r;switch(t.to){case 10:r="vec4<f16>";break;case 1:r="vec4<f32>";break;case 12:r="vec4<u32>";break;case 6:r="vec4<i32>";break;case 9:r="vec4<bool>";break;default:throw new RangeError(`not supported type (specified in attribute 'to' from 'Cast' operator): ${t.to}`)}e.compute(he(e.inputs[0],"Cast",r,void 0,t.cacheKey,t.to))},bl=e=>{let t,r,i=e.length>=2&&e[1].data!==0,n=e.length>=3&&e[2].data!==0;switch(e[0].dataType){case 1:t=i?e[1].getFloat32Array()[0]:-34028234663852886e22,r=n?e[2].getFloat32Array()[0]:34028234663852886e22;break;case 10:t=i?e[1].getUint16Array()[0]:64511,r=n?e[2].getUint16Array()[0]:31743;break;default:throw new Error("Unsupport data type")}return fe({min:t,max:r})},ch=(e,t)=>{let r=t||bl(e.inputs),i=Ce(e.inputs[0].dataType);e.compute(he(e.inputs[0],"Clip",n=>`clamp(${n}, vec4<${i}>(uniforms.min), vec4<${i}>(uniforms.max))`,void 0,r.cacheKey,void 0,[{type:e.inputs[0].dataType,data:r.min},{type:e.inputs[0].dataType,data:r.max}],[{name:"min",type:i},{name:"max",type:i}]),{inputs:[0]})},hh=e=>{e.compute(he(e.inputs[0],"Ceil","ceil"))},fh=e=>{e.compute(he(e.inputs[0],"Cos","cos"))},mh=e=>{e.compute(he(e.inputs[0],"Cosh","cosh"))},Tr=e=>fe(e),gh=(e,t)=>{let r=Ce(e.inputs[0].dataType);e.compute(he(e.inputs[0],"Elu",i=>`elu_vf32(${i})`,`
  const elu_alpha_ = ${r}(${t.alpha});

  fn elu_f32(a: ${r}) -> ${r} {
  return select((exp(a) - 1.0) * elu_alpha_, a, a >= 0.0);
  }

  fn elu_vf32(v: vec4<${r}>) -> vec4<${r}> {
  return vec4(elu_f32(v.x), elu_f32(v.y), elu_f32(v.z), elu_f32(v.w));
  }`,t.cacheKey))},di=(e="f32")=>`
const r0: ${e} = 0.3275911;
const r1: ${e} = 0.254829592;
const r2: ${e} = -0.284496736;
const r3: ${e} = 1.421413741;
const r4: ${e} = -1.453152027;
const r5: ${e} = 1.061405429;

fn erf_vf32(v: vec4<${e}>) -> vec4<${e}> {
  let absv = abs(v);
  let x = 1.0 / (1.0 + r0 * absv);
  return sign(v) * (1.0 - ((((r5 * x + r4) * x + r3) * x + r2) * x + r1) * x * exp(-absv * absv));
}`,_h=e=>{let t=Ce(e.inputs[0].dataType);e.compute(he(e.inputs[0],"Erf",r=>`erf_vf32(${r})`,di(t)))},yh=e=>{e.compute(he(e.inputs[0],"Exp","exp"))},bh=e=>{e.compute(he(e.inputs[0],"Floor","floor"))},wh=e=>{let t=Ce(e.inputs[0].dataType);e.compute(he(e.inputs[0],"Gelu",r=>`0.5 * ${r} * (1.0 + erf_vf32(${r} * 0.7071067811865475))`,di(t)))},vh=(e,t)=>{let r=Ce(e.inputs[0].dataType);e.compute(he(e.inputs[0],"LeakyRelu",i=>`select(leaky_relu_alpha_ * ${i}, ${i}, ${i} >= vec4<${r}>(0.0))`,`const leaky_relu_alpha_ = ${r}(${t.alpha});`,t.cacheKey))},$h=e=>{e.compute(he(e.inputs[0],"Not",t=>`!${t}`))},xh=e=>{e.compute(he(e.inputs[0],"Neg",t=>`-${t}`))},Sh=e=>{e.compute(he(e.inputs[0],"Reciprocal",t=>`1.0/${t}`))},Th=e=>{let t=Ce(e.inputs[0].dataType);e.compute(he(e.inputs[0],"Relu",r=>`select(vec4<${t}>(0.0), ${r}, ${r} > vec4<${t}>(0.0))`))},Eh=e=>{e.compute(he(e.inputs[0],"Sigmoid",t=>`(1.0 / (1.0 + exp(-${t})))`))},Ih=e=>fe(e),kh=(e,t)=>{let r=Ce(e.inputs[0].dataType);e.compute(he(e.inputs[0],"HardSigmoid",i=>`max(vec4<${r}>(0.0), min(vec4<${r}>(1.0), ${t.alpha} * ${i} + vec4<${r}>(${t.beta})))`,void 0,t.cacheKey))},Ch=e=>{let t=Ce(e.inputs[0].dataType);e.compute(he(e.inputs[0],"HardSwish",r=>`${r} * max(vec4<${t}>(0.0), min(vec4<${t}>(1.0), vec4<${t}>(${t}(1.0 / 6.0)) * ${r} + vec4<${t}>(0.5)))`))},zh=e=>{e.compute(he(e.inputs[0],"Sin","sin"))},Oh=e=>{e.compute(he(e.inputs[0],"Sinh","sinh"))},Ah=e=>{e.compute(he(e.inputs[0],"Sqrt","sqrt"))},Rh=e=>{e.compute(he(e.inputs[0],"Tan","tan"))},Tn=e=>`sign(${e}) * (1 - exp(-2 * abs(${e}))) / (1 + exp(-2 * abs(${e})))`,Dh=e=>{e.compute(he(e.inputs[0],"Tanh",Tn))},pa=(e="f32")=>`
const fast_gelu_a: ${e} = 0.5;
const fast_gelu_b: ${e} = 0.7978845608028654;
const fast_gelu_c: ${e} = 0.035677408136300125;

fn tanh_v(v: vec4<${e}>) -> vec4<${e}> {
  return ${Tn("v")};
}
`,ca=e=>`(fast_gelu_a + fast_gelu_a * tanh_v(${e} * (fast_gelu_c * ${e} * ${e} + fast_gelu_b))) * ${e}`,Mh=e=>{let t=Ce(e.inputs[0].dataType);e.compute(he(e.inputs[0],"FastGelu",ca,pa(t),void 0,e.inputs[0].dataType))},Bh=(e,t)=>{let r=Ce(e.inputs[0].dataType);return e.compute(he(e.inputs[0],"ThresholdedRelu",i=>`select(vec4<${r}>(0.0), ${i}, ${i} > thresholded_relu_alpha_)`,`const thresholded_relu_alpha_ = vec4<${r}>(${t.alpha});`,t.cacheKey)),0},Nh=e=>{e.compute(he(e.inputs[0],"Log","log"))},wl=(e,t)=>`
const alpha = vec4<${e}>(${t});
const one = ${e}(1.0);
const zero = ${e}(0.0);

fn quick_gelu_impl(x: vec4<${e}>) -> vec4<${e}> {
  let v = x *alpha;
  var x1 : vec4<${e}>;
  for (var i = 0; i < 4; i = i + 1) {
    if (v[i] >= zero) {
      x1[i] = one / (one + exp(-v[i]));
    } else {
      x1[i] = one - one / (one + exp(v[i]));
    }
  }
  return x * x1;
}
`,vl=e=>`quick_gelu_impl(${e})`,Ph=(e,t)=>{let r=Ce(e.inputs[0].dataType);e.compute(he(e.inputs[0],"QuickGelu",vl,wl(r,t.alpha),t.cacheKey,e.inputs[0].dataType))}}),$l,xl,Lh,xy=L(()=>{"use strict";ne(),ae(),Ba(),$l=e=>{if(e[0].dims.length!==3)throw new Error("input should have 3 dimensions");if(![2560,5120,10240].includes(e[0].dims[2]))throw new Error("hidden state should be 2560, 5120 or 10240");if(e[1].dims.length!==1)throw new Error("bias is expected to have 1 dimensions");if(e[0].dims[2]!==e[1].dims[0])throw new Error("last dimension of input and bias are not the same")},xl=e=>{let t=e[0].dims.slice();t[2]=t[2]/2;let r=D("input",e[0].dataType,e[0].dims,4),i=D("bias",e[0].dataType,[e[0].dims[2]],4),n=H("output",e[0].dataType,t,4),a=R.size(t)/4,s=ze(e[0].dataType);return{name:"BiasSplitGelu",getRunData:()=>({outputs:[{dims:t,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(a/64)}}),getShaderSource:o=>`
  const M_SQRT2 = sqrt(2.0);
  const halfChannels = ${e[0].dims[2]/4/2}u;

  ${o.declareVariables(r,i,n)}

  ${di(s)}

  ${o.mainStart()}
    ${o.guardAgainstOutOfBoundsWorkgroupSizes(a)}
    let biasIdx = global_idx % halfChannels;
    let batchIndex = global_idx / halfChannels;
    let inputOffset = biasIdx + batchIndex * halfChannels * 2;
    let valueLeft = input[inputOffset] + bias[biasIdx];
    let valueRight = input[inputOffset + halfChannels] + bias[biasIdx + halfChannels];
    let geluRight = valueRight * 0.5 * (erf_vf32(valueRight / M_SQRT2) + 1);

    ${n.setByOffset("global_idx","valueLeft * geluRight")}
  }`}},Lh=e=>{$l(e.inputs),e.compute(xl(e.inputs))}}),Sl,Tl,Ze,Uh,Wh,qh,Vh,Gh,Fh,Hh,jh,Kh,Xh,Sy=L(()=>{"use strict";te(),ne(),ae(),Sl=(e,t,r,i,n,a,s,o,l,d,h,c)=>{let f,y;typeof o=="string"?f=y=(b,T)=>`${o}((${b}),(${T}))`:typeof o=="function"?f=y=o:(f=o.scalar,y=o.vector);let _=H("outputData",h,i.length,4),w=D("aData",l,t.length,4),S=D("bData",d,r.length,4),v;if(n)if(a){let b=R.size(t)===1,T=R.size(r)===1,E=t.length>0&&t[t.length-1]%4===0,I=r.length>0&&r[r.length-1]%4===0;b||T?v=_.setByOffset("global_idx",y(b?`${w.type.value}(${w.getByOffset("0")}.x)`:w.getByOffset("global_idx"),T?`${S.type.value}(${S.getByOffset("0")}.x)`:S.getByOffset("global_idx"))):v=`
            let outputIndices = ${_.offsetToIndices("global_idx * 4u")};
            let offsetA = ${w.broadcastedIndicesToOffset("outputIndices",_)};
            let offsetB = ${S.broadcastedIndicesToOffset("outputIndices",_)};
            ${_.setByOffset("global_idx",y(s||E?w.getByOffset("offsetA / 4u"):`${w.type.value}(${w.getByOffset("offsetA / 4u")}[offsetA % 4u])`,s||I?S.getByOffset("offsetB / 4u"):`${S.type.value}(${S.getByOffset("offsetB / 4u")}[offsetB % 4u])`))}
          `}else v=_.setByOffset("global_idx",y(w.getByOffset("global_idx"),S.getByOffset("global_idx")));else{if(!a)throw new Error("no necessary to use scalar implementation for element-wise binary op implementation.");let b=(T,E,I="")=>{let C=`aData[indexA${E}][componentA${E}]`,z=`bData[indexB${E}][componentB${E}]`;return`
            let outputIndices${E} = ${_.offsetToIndices(`global_idx * 4u + ${E}u`)};
            let offsetA${E} = ${w.broadcastedIndicesToOffset(`outputIndices${E}`,_)};
            let offsetB${E} = ${S.broadcastedIndicesToOffset(`outputIndices${E}`,_)};
            let indexA${E} = offsetA${E} / 4u;
            let indexB${E} = offsetB${E} / 4u;
            let componentA${E} = offsetA${E} % 4u;
            let componentB${E} = offsetB${E} % 4u;
            ${T}[${E}] = ${I}(${f(C,z)});
          `};h===9?v=`
            var data = vec4<u32>(0);
            ${b("data",0,"u32")}
            ${b("data",1,"u32")}
            ${b("data",2,"u32")}
            ${b("data",3,"u32")}
            outputData[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));`:v=`
            ${b("outputData[global_idx]",0)}
            ${b("outputData[global_idx]",1)}
            ${b("outputData[global_idx]",2)}
            ${b("outputData[global_idx]",3)}
          `}return`
        ${e.registerUniform("vec_size","u32").declareVariables(w,S,_)}

        ${c??""}

        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
        ${v}
      }`},Tl=(e,t,r,i,n,a,s=r.dataType)=>{let o=r.dims.map(Number),l=i.dims.map(Number),d=!R.areEqual(o,l),h=o,c=R.size(o),f=!1,y=!1,_=[d];if(d){let w=Qt.calcShape(o,l,!1);if(!w)throw new Error("Can't perform binary op on the given tensors");h=w.slice(),c=R.size(h);let S=R.size(o)===1,v=R.size(l)===1,b=o.length>0&&o[o.length-1]%4===0,T=l.length>0&&l[l.length-1]%4===0;_.push(S),_.push(v),_.push(b),_.push(T);let E=1;for(let I=1;I<h.length;I++){let C=o[o.length-I],z=l[l.length-I];if(C===z)E*=C;else break}E%4===0?(y=!0,f=!0):(S||v||b||T)&&(f=!0)}else f=!0;return _.push(f),{name:e,shaderCache:{hint:t+_.map(w=>w.toString()).join("_"),inputDependencies:["rank","rank"]},getShaderSource:w=>Sl(w,o,l,h,f,d,y,n,r.dataType,i.dataType,s,a),getRunData:()=>({outputs:[{dims:h,dataType:s}],dispatchGroup:{x:Math.ceil(c/64/4)},programUniforms:[{type:12,data:Math.ceil(R.size(h)/4)},...Q(o,l,h)]})}},Ze=(e,t,r,i,n,a)=>{e.compute(Tl(t,n??"",e.inputs[0],e.inputs[1],r,i,a))},Uh=e=>{Ze(e,"Add",(t,r)=>`${t}+${r}`)},Wh=e=>{Ze(e,"Div",(t,r)=>`${t}/${r}`)},qh=e=>{Ze(e,"Equal",{scalar:(t,r)=>`u32(${t}==${r})`,vector:(t,r)=>`vec4<u32>(${t}==${r})`},void 0,void 0,9)},Vh=e=>{Ze(e,"Mul",(t,r)=>`${t}*${r}`)},Gh=e=>{let t=D("input",e.inputs[0].dataType,e.inputs[0].dims).type.value;Ze(e,"Pow",{scalar:(r,i)=>`pow_custom(${r},${i})`,vector:(r,i)=>`pow_vector_custom(${r},${i})`},`
    fn pow_custom(a : ${t}, b : ${t}) -> ${t} {
      if (b == ${t}(0.0)) {
        return ${t}(1.0);
      } else if (a < ${t}(0.0) && f32(b) != floor(f32(b))) {
        return ${t}(pow(f32(a), f32(b))); // NaN
      }
      return select(sign(a), ${t}(1.0), round(f32(abs(b) % ${t}(2.0))) != 1.0) * ${t}(${t==="i32"?"round":""}(pow(f32(abs(a)), f32(b))));
    }
    fn pow_vector_custom(a : vec4<${t}>, b : vec4<${t}>) -> vec4<${t}> {
      // TODO: implement vectorized pow
      return vec4<${t}>(pow_custom(a.x, b.x), pow_custom(a.y, b.y), pow_custom(a.z, b.z), pow_custom(a.w, b.w));
    }
      `)},Fh=e=>{Ze(e,"Sub",(t,r)=>`${t}-${r}`)},Hh=e=>{Ze(e,"Greater",{scalar:(t,r)=>`u32(${t}>${r})`,vector:(t,r)=>`vec4<u32>(${t}>${r})`},void 0,void 0,9)},jh=e=>{Ze(e,"Less",{scalar:(t,r)=>`u32(${t}<${r})`,vector:(t,r)=>`vec4<u32>(${t}<${r})`},void 0,void 0,9)},Kh=e=>{Ze(e,"GreaterOrEqual",{scalar:(t,r)=>`u32(${t}>=${r})`,vector:(t,r)=>`vec4<u32>(${t}>=${r})`},void 0,void 0,9)},Xh=e=>{Ze(e,"LessOrEqual",{scalar:(t,r)=>`u32(${t}<=${r})`,vector:(t,r)=>`vec4<u32>(${t}<=${r})`},void 0,void 0,9)}}),El,Il,kl,Cl,Zh,Yh,Ty=L(()=>{"use strict";te(),ne(),Ie(),ae(),El=(e,t)=>{if(!e||e.length<1)throw new Error("too few inputs");let r=0,i=e[r],n=i.dataType,a=i.dims.length;e.forEach((s,o)=>{if(o!==r){if(s.dataType!==n)throw new Error("input tensors should be one type");if(s.dims.length!==a)throw new Error("input tensors should have the same shape");s.dims.forEach((l,d)=>{if(d!==t&&l!==i.dims[d])throw new Error("non concat dimensions must match")})}})},Il=(e,t)=>`
  fn calculateInputIndex(index: u32) -> u32 {
    let sizeInConcatAxis = array<u32, ${e}u>(${t});
    for (var i: u32 = 0u; i < ${e}; i += 1u ) {
      if (index < sizeInConcatAxis[i]) {
        return i;
      }
    }
    return ${e}u;
  }`,kl=(e,t)=>{let r=e.length,i=[];for(let n=0;n<r;++n){let a=t.setByOffset("global_idx",e[n].getByIndices("indices"));r===1?i.push(a):n===0?i.push(`if (inputIndex == ${n}u) { ${a} }`):n===r-1?i.push(`else { ${a} }`):i.push(`else if (inputIndex == ${n}) { ${a} }`)}return i.join(`
`)},Cl=(e,t,r,i)=>{let n=R.size(r),a=new Array(e.length),s=new Array(e.length),o=0,l=[],d=[],h=[{type:12,data:n}];for(let w=0;w<e.length;++w)o+=e[w].dims[t],a[w]=o,d.push(e[w].dims.length),s[w]=D(`input${w}`,i,d[w]),l.push("rank"),h.push({type:12,data:a[w]});for(let w=0;w<e.length;++w)h.push(...Q(e[w].dims));h.push(...Q(r));let c=H("output",i,r.length),f=c.indicesGet("indices",t),y=Array.from(Array(a.length).keys()).map(w=>`uniforms.sizeInConcatAxis${w}`).join(","),_=w=>`

  ${(()=>{w.registerUniform("outputSize","u32");for(let S=0;S<e.length;S++)w.registerUniform(`sizeInConcatAxis${S}`,"u32");return w.declareVariables(...s,c)})()}

  ${Il(a.length,y)}

  ${w.mainStart()}
    ${w.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

    var indices = ${c.offsetToIndices("global_idx")};

    let inputIndex = calculateInputIndex(${f});
    if (inputIndex != 0u) {
      let sizeInConcatAxis = array<u32, ${a.length}u>(${y});
      ${f} -= sizeInConcatAxis[inputIndex - 1u];
    }

    ${kl(s,c)}
  }`;return{name:"Concat",shaderCache:{hint:`${t}`,inputDependencies:l},getRunData:()=>({outputs:[{dims:r,dataType:i}],dispatchGroup:{x:Math.ceil(n/64)},programUniforms:h}),getShaderSource:_}},Zh=(e,t)=>{let r=e.inputs,i=r[0].dims,n=R.normalizeAxis(t.axis,i.length);El(r,n);let a=i.slice();a[n]=r.reduce((o,l)=>o+(l.dims.length>n?l.dims[n]:0),0);let s=r.filter(o=>R.size(o.dims)>0);e.compute(Cl(s,n,a,r[0].dataType),{inputs:s})},Yh=e=>fe({axis:e.axis})}),qt,Vt,Gt,Na,Ht=L(()=>{"use strict";te(),ne(),qt=(e,t,r="f32")=>{switch(e.activation){case"Relu":return`value = max(value, ${t}(0.0));`;case"Sigmoid":return`value = (${t}(1.0) / (${t}(1.0) + exp(-value)));`;case"Clip":return`value = clamp(value, ${t}(${r}(uniforms.clip_min)), ${t}(${r}(uniforms.clip_max)));`;case"HardSigmoid":return`value = max(${t}(0.0), min(${t}(1.0), ${r}(uniforms.alpha) * value + ${r}(uniforms.beta)));`;case"LeakyRelu":return`value = select(${r}(uniforms.alpha) * value, value, value >= ${t}(0.0));`;case"Tanh":return`let e2x = exp(-2.0 * abs(value));
              value = sign(value) * (1.0 - e2x) / (1.0 + e2x);
        `;case"":return"";default:throw new Error(`Unsupported activation ${e.activation}`)}},Vt=(e,t)=>{e.activation==="Clip"?t.push({type:1,data:e.clipMax},{type:1,data:e.clipMin}):e.activation==="HardSigmoid"?t.push({type:1,data:e.alpha},{type:1,data:e.beta}):e.activation==="LeakyRelu"&&t.push({type:1,data:e.alpha})},Gt=(e,t)=>{e.activation==="Clip"?t.push({name:"clip_max",type:"f32"},{name:"clip_min",type:"f32"}):e.activation==="HardSigmoid"?t.push({name:"alpha",type:"f32"},{name:"beta",type:"f32"}):e.activation==="LeakyRelu"&&t.push({name:"alpha",type:"f32"})},Na=e=>{let t=e?.activation||"";if(t==="HardSigmoid"){let[r,i]=e?.activation_params||[.2,.5];return{activation:t,alpha:r,beta:i}}else if(t==="Clip"){let[r,i]=e?.activation_params||[$c,xc];return{activation:t,clipMax:i,clipMin:r}}else if(t==="LeakyRelu"){let[r]=e?.activation_params||[.01];return{activation:t,alpha:r}}return{activation:t}}}),Re,Qh,Pa=L(()=>{"use strict";Re=(e,t)=>{switch(e){case 1:return t;case 2:return`vec2<${t}>`;case 3:return`vec3<${t}>`;case 4:return`vec4<${t}>`;default:throw new Error(`${e}-component is not supported.`)}},Qh=e=>`
      ${e?"value = value + getBiasByOutputCoords(coords);":""}
      `}),Jh,Ey=L(()=>{"use strict";Jh=e=>`
fn getIndexFromCoords4D(coords : vec4<i32>, shape : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
      shape.y * shape.z * shape.w, shape.z * shape.w, shape.w, 1));
}
fn getOutputIndexFromCoords(coords : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
    i32(${e}.x), i32(${e}.y), i32(${e}.z), 1));
}
`}),Ir,La,Ua=L(()=>{"use strict";te(),ne(),ae(),Ht(),Ir=(e,t,r,i,n)=>{let a=i-r;return`
      ${Array.from({length:r}).map((s,o)=>`
      if (${Z(t.shape,o,t.rank)} != 1) {
        ${t.indicesSet(e,o,Z(n,o+a,i))}
      } else {
        ${t.indicesSet(e,o,0)}
      }`).join("")}
`},La=(e,t,r,i,n=!1,a)=>{let s=e[0].dims,o=e[1].dims,l=s[s.length-2],d=o[o.length-1],h=s[s.length-1],c=Ee(d),f=Ee(h),y=Ee(l),_=R.size(r)/c/y,w=e.length>2,S=i?i.slice(0,-2):r.slice(0,-2),v=[R.size(S),l,d],b=[{type:12,data:_},{type:12,data:l},{type:12,data:d},{type:12,data:h}];Vt(t,b),b.push(...Q(S,s,o)),w&&b.push(...Q(e[2].dims)),b.push(...Q(v));let T=E=>{let I=Ra("batch_dims",e[0].dataType,S.length),C=D("a",e[0].dataType,s.length,f),z=D("b",e[1].dataType,o.length,c),$=H("output",e[0].dataType,v.length,c),B=ze($.type.tensor),W=qt(t,$.type.value,B),F=[C,z],q="";if(w){let O=n?c:1;F.push(D("bias",e[2].dataType,e[2].dims.length,O)),q=`${n?`value += bias[col / ${O}];`:`value += ${$.type.value}(bias[row + i]);`}`}let P=[{name:"output_size",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"}];Gt(t,P);let K=()=>{let O=`var a_data: ${C.type.value};`;for(let U=0;U<f;U++)O+=`
              let b_data${U} = b[(b_offset + (k + ${U}) * uniforms.N + col) / ${c}];`;for(let U=0;U<y;U++){O+=`a_data = a[(a_offset + (row + ${U}) * uniforms.K + k) / ${f}];`;for(let J=0;J<f;J++)O+=`
            values[${U}] = fma(${z.type.value}(a_data${f===1?"":`[${J}]`}), b_data${J}, values[${U}]);
`}return O};return`
  ${E.registerUniforms(P).registerInternalVariables(I).declareVariables(...F,$)}
  ${E.mainStart()}
    ${E.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let col = (global_idx % (uniforms.N / ${c})) * ${c};
    var index1 = global_idx / (uniforms.N / ${c});
    let stride1 = uniforms.M / ${y};
    let row = (index1 % stride1) * ${y};
    let batch = index1 / stride1;

    ${r.length===2?"":`let batch_indices = ${I.offsetToIndices("batch")};`}

    var a_indices: ${C.type.indices};
    ${Ir("a_indices",C,C.rank-2,I.rank,"batch_indices")}
    ${C.indicesSet("a_indices",C.rank-2,0)}
    ${C.indicesSet("a_indices",C.rank-1,0)}
    let a_offset = ${C.indicesToOffset("a_indices")};

    var b_indices: ${z.type.indices};
    ${Ir("b_indices",z,z.rank-2,I.rank,"batch_indices")}
    ${z.indicesSet("b_indices",z.rank-2,0)}
    ${z.indicesSet("b_indices",z.rank-1,0)}
    let b_offset = ${z.indicesToOffset("b_indices")};
    var values: array<${$.type.value}, ${y}>;
    for (var k: u32 = 0u; k < uniforms.K; k = k + ${f}) {
      ${K()}
    }
    for (var i = 0u; i < ${y}u; i++) {
      var value = values[i];
      ${q}
      ${W}
      let cur_indices = ${$.type.indices}(batch, row + i, col);
      let offset = ${$.indicesToOffset("cur_indices")};
      ${$.setByOffset(`offset / ${c}`,"value")};
    }
  }
  `};return{name:"MatMulNaive",shaderCache:{hint:`${t.activation};${c};${f};${y};${n}`,inputDependencies:w?["rank","rank","rank"]:["rank","rank"]},getRunData:()=>({outputs:[{dims:a?a(r):r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(_/64)},programUniforms:b}),getShaderSource:T}}}),zl,Ol,ha,En,Al,fa,Rl,mi,Wa=L(()=>{"use strict";te(),ne(),ae(),Ht(),Ua(),Pa(),zl=(e,t)=>e?`
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          kStart + inputRow,
          globalRowStart / innerElementSize + inputCol${t?", batchIndices":""});
        `:`
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          globalRow + innerRow,
          kStart / innerElementSize + inputCol${t?", batchIndices":""});
        `,Ol=(e,t)=>e?`
        let ACached0 = mm_Asub[k * innerElementSize][localRow];
        let ACached1 = mm_Asub[k * innerElementSize + 1][localRow];
        let ACached2 = mm_Asub[k * innerElementSize + 2][localRow];
        ${t===3?"":"let ACached3 = mm_Asub[k * innerElementSize + 3][localRow];"}
        for (var i = 0; i < rowPerThread; i = i + 1) {
          acc[i] = BCached0 * ACached0[i] + acc[i];
          acc[i] = BCached1 * ACached1[i] + acc[i];
          acc[i] = BCached2 * ACached2[i] + acc[i];
          ${t===3?"":"acc[i] = BCached3 * ACached3[i] + acc[i];"}
        }`:`
        for (var i = 0; i < rowPerThread; i = i + 1) {
          let ACached = mm_Asub[tileRow + i][k];
          acc[i] = BCached0 * ACached.x + acc[i];
          acc[i] = BCached1 * ACached.y + acc[i];
          acc[i] = BCached2 * ACached.z + acc[i];
          ${t===3?"":"acc[i] = BCached3 * ACached.w + acc[i];"}
        }`,ha=(e,t,r="f32",i,n=!1,a=32,s=!1,o=32)=>{let l=t[1]*e[1],d=t[0]*e[0],h=n?l:a,c=n?a:l,f=h/t[0],y=a/t[1];if(!((n&&f===4&&e[1]===4||!n&&(f===3||f===4))&&h%t[0]===0&&a%t[1]===0&&e[0]===4))throw new Error(`If transposeA ${n} is true, innerElementSize ${f} and workPerThread[1] ${e[1]} must be 4.
      Otherwise, innerElementSize ${f} must be 3 or 4.
  tileAWidth ${h} must be divisible by workgroupSize[0]${t[0]}. tileInner ${a} must be divisible by workgroupSize[1] ${t[1]}. colPerThread ${e[0]} must be 4.`);return`
var<workgroup> mm_Asub: array<array<vec${f}<${r}>, ${h/f}>, ${c}>;
var<workgroup> mm_Bsub: array<array<vec4<${r}>, ${d/e[0]}>, ${a}>;

const rowPerThread = ${e[1]};
const colPerThread = ${e[0]};
const innerElementSize = ${f};
const tileInner = ${a};

@compute @workgroup_size(${t[0]}, ${t[1]}, ${t[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
  let localRow = i32(localId.y);
  let tileRow = localRow * rowPerThread;
  let tileCol = i32(localId.x);

  let globalRow =i32(globalId.y) * rowPerThread;
  let globalCol = i32(globalId.x);
  let batch = ${s?"0":"i32(globalId.z)"};
  ${i?`let batchIndices = ${i.offsetToIndices("u32(batch)")};`:""}
  let globalRowStart = i32(workgroupId.y) * ${l};

  let num_tiles = ${s?`${Math.ceil(o/a)}`:"(uniforms.dim_inner - 1) / tileInner + 1"};
  var kStart = ${s?`i32(globalId.z) * ${o}`:"0"};

  var acc: array<vec4<${r}>, rowPerThread>;

  // Loop over shared dimension.
  let tileRowB = localRow * ${y};
  for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let inputRow = tileRow + innerRow;
          let inputCol = tileCol;
          ${zl(n,i)}
      }

      // Load one tile of B into local memory.
      for (var innerRow = 0; innerRow < ${y}; innerRow = innerRow + 1) {
          let inputRow = tileRowB + innerRow;
          let inputCol = tileCol;
          mm_Bsub[inputRow][inputCol] = mm_readB(batch, kStart + inputRow, globalCol${i?", batchIndices":""});
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      for (var k = 0; k < tileInner / innerElementSize; k = k + 1) {
          let BCached0 = mm_Bsub[k * innerElementSize][tileCol];
          let BCached1 = mm_Bsub[k * innerElementSize + 1][tileCol];
          let BCached2 = mm_Bsub[k * innerElementSize + 2][tileCol];
          ${f===3?"":"let BCached3 = mm_Bsub[k * innerElementSize + 3][tileCol];"}

          ${Ol(n,f)}
      }

      workgroupBarrier();
  }

  for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      mm_write(batch, globalRow + innerRow, globalCol, acc[innerRow]);
  }
}`},En=(e,t)=>e?`
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              kStart + inputRow,
              globalRowStart + inputCol${t?", batchIndices":""});
            `:`
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              globalRowStart + inputRow,
              kStart + inputCol${t?", batchIndices":""});
            `,Al=e=>e?"let ACached = mm_Asub[k][tileRow + innerRow];":"let ACached = mm_Asub[tileRow + innerRow][k];",fa=(e,t,r="f32",i,n=!1,a=32,s=!1,o=32,l=!1)=>{let d=e[1]*t[1],h=e[0]*t[0],c=n?d:a,f=n?a:d;if(!(f%t[1]===0&&c%t[0]===0&&a%t[1]===0))throw new Error(`tileAHight ${f} must be divisible by workgroupSize[1]${t[1]}, tileAWidth ${c} must be divisible by workgroupSize[0]${t[0]}, tileInner ${a} must be divisible by workgroupSize[1]${t[1]}`);let y=f/t[1],_=c/t[0],w=a/t[1],S=l?`
    let localRow = i32(localId.y);
    let localCol = i32(localId.x);
    let globalRowStart = i32(workgroupId.y) * ${d};
    let globalColStart = i32(workgroupId.x) * ${h};

    // Loop over shared dimension.
    for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var inputRow = localRow; inputRow < ${f}; inputRow = inputRow + ${t[1]}) {
        for (var inputCol = localCol; inputCol < ${c}; inputCol = inputCol + ${t[0]}) {
          ${En(n,i)}
        }
      }
      // Load one tile of B into local memory.
      for (var inputRow = localRow; inputRow < ${a}; inputRow = inputRow + ${t[1]}) {
            for (var inputCol = localCol; inputCol < ${h}; inputCol = inputCol + ${t[0]}) {
          mm_Bsub[inputRow][inputCol] = mm_readB(batch,
            kStart + inputRow,
            globalColStart + inputCol${i?", batchIndices":""});
        }
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      var BCached : array<${r}, colPerThread>;
      for (var k = 0; k < tileInner; k = k + 1) {
        for (var inner = 0; inner < colPerThread; inner = inner + 1) {
          BCached[inner] = mm_Bsub[k][localCol + inner * ${t[0]}];
        }
        for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let ACached = ${n?`mm_Asub[k][localRow + innerRow * ${t[1]}];`:`mm_Asub[localRow + innerRow * ${t[1]}][k];`}
          for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
            acc[innerRow][innerCol] = acc[innerRow][innerCol] +
                ACached * BCached[innerCol];
          }
        }
      }
      workgroupBarrier();
    }
    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      let gRow = globalRowStart + localRow + innerRow * ${t[1]};
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        let gCol = globalColStart + localCol + innerCol * ${t[0]};
        mm_write(batch, gRow, gCol, acc[innerRow][innerCol]);
      }
    }
    `:`
let tileRow = i32(localId.y) * rowPerThread;
let tileCol = i32(localId.x) * colPerThread;

let globalRow = i32(globalId.y) * rowPerThread;
let globalCol = i32(globalId.x) * colPerThread;
let globalRowStart = i32(workgroupId.y) * ${d};

let tileRowA = i32(localId.y) * ${y};
let tileColA = i32(localId.x) * ${_};
let tileRowB = i32(localId.y) * ${w};
// Loop over shared dimension.
for (var t = 0; t < num_tiles; t = t + 1) {
  // Load one tile of A into local memory.
  for (var innerRow = 0; innerRow < ${y}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < ${_}; innerCol = innerCol + 1) {
      let inputRow = tileRowA + innerRow;
      let inputCol = tileColA + innerCol;
      ${En(n,i)}
    }
  }

  // Load one tile of B into local memory.
  for (var innerRow = 0; innerRow < ${w}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
      let inputRow = tileRowB + innerRow;
      let inputCol = tileCol + innerCol;
      mm_Bsub[inputRow][inputCol] = mm_readB(batch,
        kStart + inputRow,
        globalCol + innerCol${i?", batchIndices":""});
    }
  }
  kStart = kStart + tileInner;
  workgroupBarrier();

  // Compute acc values for a single thread.
  var BCached : array<${r}, colPerThread>;
  for (var k = 0; k < tileInner; k = k + 1) {
    for (var inner = 0; inner < colPerThread; inner = inner + 1) {
      BCached[inner] = mm_Bsub[k][tileCol + inner];
    }

    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      ${Al(n)}
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        acc[innerRow][innerCol] = acc[innerRow][innerCol] + ACached * BCached[innerCol];
      }
    }
  }

  workgroupBarrier();
}

for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
  for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
    mm_write(batch, globalRow + innerRow, globalCol + innerCol,
        acc[innerRow][innerCol]);
  }
}
`;return`
  var<workgroup> mm_Asub : array<array<${r}, ${c}>, ${f}>;
  var<workgroup> mm_Bsub : array<array<${r}, ${h}>, ${a}>;
  const rowPerThread = ${e[1]};
  const colPerThread = ${e[0]};
  const tileInner = ${a};

@compute @workgroup_size(${t[0]}, ${t[1]}, ${t[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
    let batch = ${s?"0":"i32(globalId.z)"};
    ${i?`let batchIndices = ${i.offsetToIndices("u32(batch)")};`:""}
    let num_tiles = ${s?`${Math.ceil(o/a)}`:"(uniforms.dim_inner - 1) / tileInner + 1"};
    var kStart = ${s?`i32(globalId.z) * ${o}`:"0"};

    var acc : array<array<${r}, colPerThread>, rowPerThread>;
    ${S}
  }
`},Rl=(e,t,r,i,n=!1)=>{let[a,s,o,l]=i,d=ze(i[0].type.tensor);return`
    fn mm_readA(batch: i32, row: i32, colIn: i32, batchIndices: ${a.type.indices}) -> ${Re(e,d)} {
      var value = ${Re(e,d)}(0.0);
      let col = colIn * ${e};
      if(row < uniforms.dim_a_outer && col < uniforms.dim_inner)
      {
        var aIndices: ${s.type.indices};
        ${Ir("aIndices",s,s.rank-2,a.rank,"batchIndices")}
        ${s.indicesSet("aIndices",s.rank-2,"u32(row)")}
        ${s.indicesSet("aIndices",s.rank-1,"u32(colIn)")}
        value = ${s.getByIndices("aIndices")};
      }
      return value;
    }

    fn mm_readB(batch: i32, row: i32, colIn: i32, batchIndices: ${a.type.indices}) -> ${Re(e,d)} {
      var value = ${Re(e,d)}(0.0);
      let col = colIn * ${e};
      if(row < uniforms.dim_inner && col < uniforms.dim_b_outer)
      {
        var bIndices: ${o.type.indices};
        ${Ir("bIndices",o,o.rank-2,a.rank,"batchIndices")}
        ${o.indicesSet("bIndices",o.rank-2,"u32(row)")}
        ${o.indicesSet("bIndices",o.rank-1,"u32(colIn)")}
        value = ${o.getByIndices("bIndices")};
      }
      return value;
    }

    fn mm_write(batch: i32, row: i32, colIn: i32, valueIn: ${Re(e,d)}) {
      let col = colIn * ${e};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer) {
        var value = valueIn;
        let coords = vec3<i32>(batch, row, colIn);
        ${t?`value = value + ${n?"bias[colIn]":`${Re(e,d)}(bias[row])`};`:""}
        ${r}
        ${l.setByIndices("vec3<u32>(coords)","value")}
      }
    }
    `},mi=(e,t,r,i,n=!1,a)=>{let s=e[0].dims,o=e[1].dims,l=s.slice(0,-2),d=o.slice(0,-2),h=i?i.slice(0,-2):r.slice(0,-2),c=R.size(h),f=s[s.length-2],y=s[s.length-1],_=o[o.length-1],w=y%4===0&&_%4===0,S=f<=8?[4,1,1]:[4,4,1],v=[8,8,1],b=[Math.ceil(_/v[0]/S[0]),Math.ceil(f/v[1]/S[1]),Math.ceil(c/v[2]/S[2])],T=w?4:1,E=[...l,f,y/T],I=E.length,C=[...d,y,_/T],z=C.length,$=[c,f,_/T],B=[{type:6,data:f},{type:6,data:_},{type:6,data:y}];Vt(t,B),B.push(...Q(h,E,C));let W=["rank","rank"],F=e.length>2;F&&(B.push(...Q(e[2].dims)),W.push("rank")),B.push(...Q($));let q=P=>{let K=h.length,O=Ra("batchDims",e[0].dataType,K,1),U=ze(e[0].dataType),J=D("a",e[0].dataType,I,T),re=D("b",e[1].dataType,z,T),X=H("result",e[0].dataType,$.length,T),se=[J,re];if(F){let ve=n?T:1;se.push(D("bias",e[2].dataType,e[2].dims.length,ve))}let N=[{name:"dim_a_outer",type:"i32"},{name:"dim_b_outer",type:"i32"},{name:"dim_inner",type:"i32"}];Gt(t,N);let ee=ze(X.type.tensor),Y=qt(t,X.type.value,ee),j=Rl(T,F,Y,[O,J,re,X],n);return`
  ${P.registerUniforms(N).registerInternalVariables(O).declareVariables(...se,X)}
  ${j}
  ${w?ha(S,v,U,O):fa(S,v,U,O)}
                   `};return{name:"MatMul",shaderCache:{hint:`${S};${t.activation};${w};${n}`,inputDependencies:W},getRunData:()=>({outputs:[{dims:a?a(r):r,dataType:e[0].dataType}],dispatchGroup:{x:b[0],y:b[1],z:b[2]},programUniforms:B}),getShaderSource:q}}}),Dl,ef,Iy=L(()=>{"use strict";te(),dt(),ae(),Ht(),Pa(),Ey(),Wa(),Dl=(e,t,r,i,n=!1,a,s=4,o=4,l=4,d="f32")=>{let h=B=>{switch(B){case 1:return"resData = x[xIndex];";case 3:return`resData = vec3<${d}>(x[xIndex], x[xIndex + 1], x[xIndex + 2]);`;case 4:return"resData = x[xIndex / 4];";default:throw new Error(`innerElementSize ${B} is not supported.`)}},c=B=>{switch(B){case 1:return"return w[row * i32(uniforms.w_shape[3]) + colIn];";case 4:return"return w[row * i32(uniforms.w_shape[3]) / 4 + colIn];";default:throw new Error(`innerElementSize ${B} is not supported.`)}},f=e?`
    let coord = vec4<i32>(batch, xRow, xCol, xCh);
    `:`
    let coord = vec4<i32>(batch, xCh, xRow, xCol);
    `,y=e?`
    let coords = vec4<i32>(
      batch,
      row / outWidth,
      row % outWidth,
      col);
    `:`
    let coords = vec4<i32>(
      batch,
      row,
      col / outWidth,
      col % outWidth);
    `,_=e?"i32(uniforms.x_shape[1])":"i32(uniforms.x_shape[2])",w=e?"i32(uniforms.x_shape[2])":"i32(uniforms.x_shape[3])",S=e?"row":"col",v=e?"col":"row",b=`
    let inChannels = i32(uniforms.w_shape[2]);
    let outWidth = ${e?"i32(uniforms.result_shape[2])":"i32(uniforms.result_shape[3])"};
    let outRow = ${S} / outWidth;
    let outCol = ${S} % outWidth;

    let WRow = ${v} / (i32(uniforms.w_shape[1]) * inChannels);
    let WCol = ${v} / inChannels % i32(uniforms.w_shape[1]);
    let xRow = outRow * uniforms.stride[0] + uniforms.dilation[0] * WRow - uniforms.pad[0];
    let xCol = outCol * uniforms.stride[1] + uniforms.dilation[1] * WCol - uniforms.pad[1];
    let xCh = ${v} % inChannels;
    var resData = ${Re(s,d)}(0.0);
    // The bounds checking is always needed since we use it to pad zero for
    // the 'same' padding type.
    if (xRow >= 0 && xRow < ${_} && xCol >= 0 && xCol < ${w}) {
      ${f}
      let xIndex = getIndexFromCoords4D(coord, vec4<i32>(uniforms.x_shape));
      ${h(s)}
    }
    return resData;`,T=e?t&&i?`
    let col = colIn * ${s};
    ${b}`:`
    let col = colIn * ${s};
    if (row < uniforms.dim_a_outer && col < uniforms.dim_inner) {
      ${b}
    }
    return ${Re(s,d)}(0.0);`:i&&r?`
    let col = colIn * ${s};
    ${b}`:`
    let col = colIn * ${s};
    if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
      ${b}
    }
    return ${Re(s,d)}(0.0);`,E=e?i&&r?c(o):`
    let col = colIn * ${o};
    if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
      ${c(o)}
    }
    return ${Re(o,d)}(0.0);`:`
    let col = colIn * ${o};
    if (row < uniforms.dim_inner && col < uniforms.dim_a_outer) {
      ${c(o)}
    }
    return ${Re(o,d)}(0.0);`,I=Re(l,d),C=Re(e?s:o,d),z=Re(e?o:s,d),$=qt(a,I,d);return`
    fn mm_readA(batch: i32, row : i32, colIn : i32) -> ${C} {
      ${e?T:E}
    }

    fn mm_readB(batch: i32, row : i32, colIn : i32) -> ${z} {
      ${e?E:T}
    }

    fn mm_write(batch: i32, row : i32, colIn : i32, valueIn : ${I}) {
      let col = colIn * ${l};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer)
      {
      var value = valueIn;
      let outWidth = ${e?"i32(uniforms.result_shape[2])":"i32(uniforms.result_shape[3])"};
      ${y}
      ${Qh(n)}
      ${$}
      setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
      }
    }`},ef=(e,t,r,i,n,a,s,o,l)=>{let d=t.format==="NHWC",h=d?e[0].dims[3]:e[0].dims[1],c=r[0],f=d?r[2]:r[3],y=d?r[1]:r[2],_=d?r[3]:r[1],w=d&&(h%4===0||h%3===0)&&_%4===0,S=d?_:f*y,v=d?f*y:_,b=[8,8,1],T=i<=8?[4,1,1]:[4,4,1],E=[Math.ceil(S/b[0]/T[0]),Math.ceil(v/b[1]/T[1]),Math.ceil(c/b[2]/T[2])];pe("verbose",()=>`[conv2d_mm_webgpu] dispatch = ${E}`);let I=w?d&&h%4!==0?3:4:1,C=b[1]*T[1],z=b[0]*T[0],$=Math.max(b[0]*I,b[1]),B=i%C===0,W=n%z===0,F=a%$===0,q=w?[I,4,4]:[1,1,1],P=[{type:6,data:i},{type:6,data:n},{type:6,data:a},{type:6,data:[t.pads[0],t.pads[1]]},{type:6,data:t.strides},{type:6,data:t.dilations}];Vt(t,P),P.push(...Q(e[0].dims,e[1].dims));let K=["rank","rank"];s&&(P.push(...Q(e[2].dims)),K.push("rank")),P.push(...Q(r));let O=U=>{let J=[{name:"dim_a_outer",type:"i32"},{name:"dim_b_outer",type:"i32"},{name:"dim_inner",type:"i32"},{name:"pad",type:"i32",length:2},{name:"stride",type:"i32",length:2},{name:"dilation",type:"i32",length:2}];Gt(t,J);let re=w?4:1,X=ze(e[0].dataType),se=`
      fn setOutputAtIndex(flatIndex : i32, value : ${w?`vec4<${X}>`:X}) {
        result[flatIndex] = ${w?`vec4<${X}>`:X}(value);
      }
      fn setOutputAtCoords(d0 : i32, d1 : i32, d2 : i32, d3 : i32, value : ${w?`vec4<${X}>`:X}) {
        let flatIndex = getOutputIndexFromCoords(vec4<i32>(d0, d1, d2, d3));
        setOutputAtIndex(flatIndex ${w?"/ 4":""}, value);
      }`,N=D("x",e[0].dataType,e[0].dims.length,I===3?1:I),ee=D("w",e[1].dataType,e[1].dims.length,re),Y=[N,ee],j=H("result",e[0].dataType,r.length,re);if(s){let ve=D("bias",e[2].dataType,e[2].dims.length,re);Y.push(ve),se+=`
        fn getBiasByOutputCoords(coords : vec4<i32>) -> ${w?`vec4<${X}>`:X} {
          return bias[coords.${d?"w":"y"}${w?"/ 4":""}];
        }`}return`
        ${Jh("uniforms.result_strides")}
        //struct Uniforms { xShape : vec4<i32>, wShape : vec4<i32>, outShape : vec4<i32>,
        //  outShapeStrides: vec3<i32>, filterDims : vec2<i32>, pad : vec2<i32>, stride : vec2<i32>,
        //  dilation : vec2<i32>, dimAOuter : i32, dimBOuter : i32, dimInner : i32 };
        ${U.registerUniforms(J).declareVariables(...Y,j)}
        ${se}
        ${Dl(d,B,W,F,s,t,q[0],q[1],q[2],X)}
        ${w?ha(T,b,X,void 0,!d,$):fa(T,b,X,void 0,!d,$,!1,void 0,o)}`};return{name:"Conv2DMatMul",shaderCache:{hint:`${t.cacheKey};${I};${w};${B};${W};${F};${C};${z};${$}`,inputDependencies:K},getRunData:()=>({outputs:[{dims:l?l(r):r,dataType:e[0].dataType}],dispatchGroup:{x:E[0],y:E[1],z:E[2]},programUniforms:P}),getShaderSource:O}}}),Ml,In,_r,Bl,kn,Nl,tf,rf,ky=L(()=>{"use strict";te(),dt(),ne(),ae(),Ht(),Pa(),Ml=e=>{let t=1;for(let r=0;r<e.length;r++)t*=e[r];return t},In=e=>typeof e=="number"?[e,e,e]:e,_r=(e,t)=>t<=1?e:e+(e-1)*(t-1),Bl=(e,t,r,i=1)=>{let n=_r(t,i);return Math.floor((e[0]*(r-1)-r+n)/2)},kn=(e,t,r,i,n)=>{n==null&&(n=Bl(e,t[0],i[0]));let a=[0,0,0,r];for(let s=0;s<3;s++)e[s]+2*n>=t[s]&&(a[s]=Math.trunc((e[s]-t[s]+2*n)/i[s]+1));return a},Nl=(e,t,r,i,n,a,s,o,l,d)=>{let h,c,f,y;if(e==="VALID"&&(e=0),typeof e=="number"){h={top:e,bottom:e,left:e,right:e,front:e,back:e};let _=kn([t,r,i,1],[o,l,d],1,[n,a,s],e);c=_[0],f=_[1],y=_[2]}else if(Array.isArray(e)){if(!e.every((w,S,v)=>w===v[0]))throw Error(`Unsupported padding parameter: ${e}`);h={top:e[0],bottom:e[1],left:e[2],right:e[3],front:e[4],back:e[5]};let _=kn([t,r,i,1],[o,l,d],1,[n,a,s],e[0]);c=_[0],f=_[1],y=_[2]}else if(e==="SAME_UPPER"){c=Math.ceil(t/n),f=Math.ceil(r/a),y=Math.ceil(i/s);let _=(c-1)*n+o-t,w=(f-1)*a+l-r,S=(y-1)*s+d-i,v=Math.floor(_/2),b=_-v,T=Math.floor(w/2),E=w-T,I=Math.floor(S/2),C=S-I;h={top:T,bottom:E,left:I,right:C,front:v,back:b}}else throw Error(`Unknown padding parameter: ${e}`);return{padInfo:h,outDepth:c,outHeight:f,outWidth:y}},tf=(e,t,r,i,n,a=!1,s="channelsLast")=>{let o,l,d,h,c;if(s==="channelsLast")[o,l,d,h,c]=e;else if(s==="channelsFirst")[o,c,l,d,h]=e;else throw new Error(`Unknown dataFormat ${s}`);let[f,,y,_,w]=t,[S,v,b]=In(r),[T,E,I]=In(i),C=_r(y,T),z=_r(_,E),$=_r(w,I),{padInfo:B,outDepth:W,outHeight:F,outWidth:q}=Nl(n,l,d,h,S,v,b,C,z,$),P=a?f*c:f,K=[0,0,0,0,0];return s==="channelsFirst"?K=[o,P,W,F,q]:s==="channelsLast"&&(K=[o,W,F,q,P]),{batchSize:o,dataFormat:s,inDepth:l,inHeight:d,inWidth:h,inChannels:c,outDepth:W,outHeight:F,outWidth:q,outChannels:P,padInfo:B,strideDepth:S,strideHeight:v,strideWidth:b,filterDepth:y,filterHeight:_,filterWidth:w,effectiveFilterDepth:C,effectiveFilterHeight:z,effectiveFilterWidth:$,dilationDepth:T,dilationHeight:E,dilationWidth:I,inShape:e,outShape:K,filterShape:t}},rf=(e,t,r,i,n,a)=>{let s=a==="channelsLast",o=s?e[0].dims[3]:e[0].dims[1],l=!1,d=[64,1,1],h={x:r.map((b,T)=>T)},c=[Math.ceil(Ml(h.x.map(b=>r[b]))/d[0]),1,1];pe("verbose",()=>`[conv3d_naive_webgpu] dispatch = ${c}`);let f=l?s&&o%4!==0?3:4:1,y=R.size(r),_=[{type:12,data:y},{type:12,data:i},{type:12,data:n},{type:12,data:t.strides},{type:12,data:t.dilations}];Vt(t,_),_.push(...Q(e[0].dims,e[1].dims));let w=["rank","rank"],S=e.length===3;S&&(_.push(...Q(e[2].dims)),w.push("rank")),_.push(...Q(r));let v=b=>{let T=[{name:"output_size",type:"u32"},{name:"filter_dims",type:"u32",length:i.length},{name:"pads",type:"u32",length:n.length},{name:"strides",type:"u32",length:t.strides.length},{name:"dilations",type:"u32",length:t.dilations.length}];Gt(t,T);let E=l?4:1,I=ze(e[0].dataType),C=D("x",e[0].dataType,e[0].dims.length,f===3?1:f),z=D("W",e[1].dataType,e[1].dims.length,E),$=[C,z],B=H("result",e[0].dataType,r.length,E),W="";if(S){let P=D("bias",e[2].dataType,e[2].dims.length,E);$.push(P),W+=`
        fn getBiasByOutputCoords(coords : array<u32, 5>) -> ${l?`vec4<${I}>`:I} {
          return bias[${s?Z("coords",4,5):Z("coords",1,5)}${l?"/ 4":""}];
        }`}let F=Re(f,I),q=qt(t,F,I);return`
            ${W}
            fn getX(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${C.getByIndices("aIndices")};
            }
            fn getW(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${z.getByIndices("aIndices")};
            }
          ${b.registerUniforms(T).declareVariables(...$,B)}
          ${b.mainStart()}
          ${b.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
              let coords = ${B.offsetToIndices("global_idx")};
              let batch = ${Z("coords",0,C.rank)};
              let d2 = ${s?Z("coords",C.rank-1,C.rank):Z("coords",1,C.rank)};
              let xFRCCorner = vec3<u32>(${s?Z("coords",1,C.rank):Z("coords",2,C.rank)},
              ${s?Z("coords",2,C.rank):Z("coords",3,C.rank)},
              ${s?Z("coords",3,C.rank):Z("coords",4,C.rank)}) * uniforms.strides - uniforms.pads;
              let xFCorner = xFRCCorner.x;
              let xRCorner = xFRCCorner.y;
              let xCCorner = xFRCCorner.z;
              let xShapeY = ${s?Z("uniforms.x_shape",1,C.rank):Z("uniforms.x_shape",2,C.rank)};
              let xShapeZ = ${s?Z("uniforms.x_shape",2,C.rank):Z("uniforms.x_shape",3,C.rank)};
              let xShapeW = ${s?Z("uniforms.x_shape",3,C.rank):Z("uniforms.x_shape",4,C.rank)};
              let xShapeU = ${s?Z("uniforms.x_shape",4,C.rank):Z("uniforms.x_shape",1,C.rank)};
              let inputDepthNearestVec4 = (xShapeU / 4) * 4;
              let inputDepthVec4Remainder = xShapeU % 4;

              var value = 0.0;
              for (var wF = 0u; wF < uniforms.filter_dims[0]; wF++) {
                let xF = xFCorner + wF * uniforms.dilations[0];
                if (xF < 0 || xF >= xShapeY) {
                  continue;
                }

                for (var wR = 0u; wR < uniforms.filter_dims[1]; wR++) {
                  let xR = xRCorner + wR * uniforms.dilations[1];
                  if (xR < 0 || xR >= xShapeZ) {
                    continue;
                  }

                  for (var wC = 0u; wC < uniforms.filter_dims[2]; wC++) {
                    let xC = xCCorner + wC * uniforms.dilations[2];
                    if (xC < 0 || xC >= xShapeW) {
                      continue;
                    }

                    for (var d1 = 0u; d1 < inputDepthNearestVec4; d1 += 4) {
                      ${s?`let xValues = vec4<f32>(
                               getX(batch, xF, xR, xC, d1),
                               getX(batch, xF, xR, xC, d1 + 1),
                               getX(batch, xF, xR, xC, d1 + 2),
                               getX(batch, xF, xR, xC, d1 + 3));
                            `:`let xValues = vec4<f32>(
                               getX(batch, d1, xF, xR, xC),
                               getX(batch, d1 + 1, xF, xR, xC),
                               getX(batch, d1 + 2, xF, xR, xC),
                               getX(batch, d1 + 3, xF, xR, xC));
                            `}
                            let wValues = vec4<f32>(
                              getW(d2, d1, wF, wR, wC),
                              getW(d2, d1 + 1, wF, wR, wC),
                              getW(d2, d1 + 2, wF, wR, wC),
                              getW(d2, d1 + 3, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                    if (inputDepthVec4Remainder == 1) {
                        ${s?`value += getX(batch, xF, xR, xC, inputDepthNearestVec4)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`:`value += getX(batch, inputDepthNearestVec4, xF, xR, xC)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`}
                    } else if (inputDepthVec4Remainder == 2) {
                      ${s?`let xValues = vec2<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1));
                      `:`let xValues = vec2<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC));
                    `}
                    let wValues = vec2<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC));
                      value += dot(xValues, wValues);
                    } else if (inputDepthVec4Remainder == 3) {
                      ${s?`let xValues = vec3<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 2));
                      `:`let xValues = vec3<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 2, xF, xR, xC));
                    `}
                    let wValues = vec3<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 2, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                  }
                }
              }
              ${S?"value = value + getBiasByOutputCoords(coords)":""};
              ${q}
              result[global_idx] = f32(value);
          }`};return{name:"Conv3DNaive",shaderCache:{hint:`${t.cacheKey};${s};${f};${S}`,inputDependencies:w},getRunData:()=>({outputs:[{dims:r,dataType:e[0].dataType}],dispatchGroup:{x:c[0],y:c[1],z:c[2]},programUniforms:_}),getShaderSource:v}}}),nf,af,Cy=L(()=>{"use strict";te(),ne(),ae(),Ht(),nf=(e,t,r,i)=>{let n=e.length>2,a=n?"value += b[output_channel];":"",s=e[0].dims,o=e[1].dims,l=t.format==="NHWC",d=l?r[3]:r[1],h=d/t.group,c=l&&h>=4?Ee(d):1,f=R.size(r)/c,y=[{type:12,data:f},{type:12,data:t.dilations},{type:12,data:[t.strides[0],t.strides[1]]},{type:12,data:[t.pads[0],t.pads[1]]},{type:12,data:h}];Vt(t,y),y.push(...Q(s,[o[0],o[1],o[2],o[3]/c]));let _=n?["rank","rank","rank"]:["rank","rank"];y.push(...Q([r[0],r[1],r[2],r[3]/c]));let w=S=>{let v=H("output",e[0].dataType,r.length,c),b=ze(v.type.tensor),T=qt(t,v.type.value,b),E=D("x",e[0].dataType,s.length),I=D("w",e[1].dataType,o.length,c),C=[E,I];n&&C.push(D("b",e[2].dataType,e[2].dims,c));let z=[{name:"output_size",type:"u32"},{name:"dilations",type:"u32",length:t.dilations.length},{name:"strides",type:"u32",length:2},{name:"pads",type:"u32",length:2},{name:"output_channels_per_group",type:"u32"}];Gt(t,z);let $=l?`
      for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[0]; wHeight++) {
        let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

        if (xHeight < 0u || xHeight >= uniforms.x_shape[1]) {
          continue;
        }

        for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[1]; wWidth++) {
          let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
          if (xWidth < 0u || xWidth >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[2]; wInChannel++) {
            let input_channel = in_channel_offset + wInChannel;
            let xVal = ${E.get("batch","xHeight","xWidth","input_channel")};
            let wVal = ${I.get("wHeight","wWidth","wInChannel","output_channel")};
            value += xVal * wVal;
          }
        }
      }
      `:`
      for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[1]; wInChannel++) {
        let input_channel = in_channel_offset + wInChannel;
        for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[2]; wHeight++) {
          let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

          if (xHeight < 0u || xHeight >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[3]; wWidth++) {
            let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
            if (xWidth < 0u || xWidth >= uniforms.x_shape[3]) {
              continue;
            }

            let xVal = ${E.get("batch","input_channel","xHeight","xWidth")};
            let wVal = ${I.get("output_channel","wInChannel","wHeight","wWidth")};
            value += xVal * wVal;
          }
        }
      }
      `;return`
  ${S.registerUniforms(z).declareVariables(...C,v)}

  ${S.mainStart()}
    ${S.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let outputIndices = ${v.offsetToIndices("global_idx")};
    let batch: u32 = outputIndices[0];
    let output_channel: u32 = outputIndices[${l?3:1}];
    let xRCCorner: vec2<u32> = vec2<u32>(outputIndices[${l?1:2}], outputIndices[${l?2:3}]) * uniforms.strides - uniforms.pads;
    let group_id: u32 = output_channel * ${c} / uniforms.output_channels_per_group;
    var in_channel_offset = group_id * uniforms.w_shape[${l?2:1}];

    var value: ${v.type.value} = ${v.type.value}(0);
    ${$}
    ${a}
    ${T}
    ${v.setByOffset("global_idx","value")}
  }`};return{name:"GroupedConv",shaderCache:{hint:`${t.cacheKey}_${c}`,inputDependencies:_},getRunData:()=>({outputs:[{dims:i?i(r):r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(f/64)},programUniforms:y}),getShaderSource:w}},af=(e,t,r,i)=>{let n=e.length>2,a=Ee(r[3]),s=Ee(r[2]),o=R.size(r)/a/s,l=[e[0].dims[0],e[0].dims[1],e[0].dims[2],e[0].dims[3]/a],d=[e[1].dims[0],e[1].dims[1],e[1].dims[2],e[1].dims[3]/a],h=[r[0],r[1],r[2],r[3]/a],c=[{type:12,data:o},{type:6,data:[t.strides[0],t.strides[1]]},{type:6,data:[t.pads[0],t.pads[1]]}];Vt(t,c),c.push(...Q(l,d,h));let f=(s-1)*t.strides[1]+d[1],y=_=>{let w=H("output",e[0].dataType,h.length,a),S=ze(w.type.tensor),v=qt(t,w.type.value,S),b=D("x",e[0].dataType,l.length,a),T=D("w",e[1].dataType,d.length,a),E=[b,T];n&&E.push(D("b",e[2].dataType,e[2].dims,a));let I=n?"value += b[output_channel];":"",C=[{name:"output_size",type:"u32"},{name:"strides",type:"i32",length:2},{name:"pads",type:"i32",length:2}];return Gt(t,C),`
  ${_.registerUniforms(C).declareVariables(...E,w)}
  ${_.mainStart()}
    ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let width0 = uniforms.output_shape[3];
    let output_channel = global_idx % width0;
    var index1 = global_idx / width0;
    let width1 = uniforms.output_shape[2] / ${s}u;
    let col = (index1 % width1) * ${s}u;
    index1 = index1 / width1;
    let row = index1 % uniforms.output_shape[1];
    let batch = index1 / uniforms.output_shape[1];

    let x_corner = vec2<i32>(i32(row), i32(col)) * uniforms.strides - uniforms.pads;

    var x_vals: array<${b.type.value}, ${f}>;
    var values: array<${w.type.value}, ${s}>;
    let input_channel = output_channel;
    // Use constant instead of uniform can give better performance for w's height/width.
    for (var w_height: u32 = 0u; w_height < ${d[0]}; w_height++) {
      let x_height = x_corner.x + i32(w_height);
      if (x_height >= 0 && u32(x_height) < uniforms.x_shape[1]) {
        for (var i = 0; i < ${f}; i++) {
          let x_width = x_corner.y + i;
          if (x_width >= 0 && u32(x_width) < uniforms.x_shape[2]) {
            x_vals[i] = ${b.get("batch","u32(x_height)","u32(x_width)","input_channel")};
          } else {
            x_vals[i] = ${b.type.value}(0);
          }
        }
        for (var w_width: u32 = 0u; w_width < ${d[1]}; w_width++) {
          let w_val = ${T.get("w_height","w_width","0","output_channel")};
          for (var i = 0u; i < ${s}u; i++) {
            values[i] = fma(x_vals[i * u32(uniforms.strides[1]) + w_width], w_val, values[i]);
          }
        }
      }
    }

    for (var i = 0u; i < ${s}u; i++) {
      var value = values[i];
      ${I}
      ${v}
      ${w.set("batch","row","col + i","output_channel","value")};
    }
  }`};return{name:"GroupedConv-Vectorize",shaderCache:{hint:`${t.cacheKey};${a};${s};${f};${d[0]};${d[1]}`,inputDependencies:n?["rank","rank","type"]:["rank","rank"]},getRunData:()=>({outputs:[{dims:i?i(r):r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(o/64)},programUniforms:c}),getShaderSource:y}}}),Pl,ri,Ll,ii,ma,Cn,Ul,Wl,ga,zy=L(()=>{"use strict";ne(),Iy(),ky(),Wa(),Cy(),Ht(),Ua(),Et(),Pl=(e,t,r,i,n,a)=>{let s=e[0],o=e.slice(a?1:2,a?3:4),l=o.length,d=t[0],h=t.slice(2).map((f,y)=>f+(f-1)*(r[y]-1)),c=o.map((f,y)=>f+i[y]+i[y+l]).map((f,y)=>Math.floor((f-h[y]+n[y])/n[y]));return c.splice(0,0,s),c.splice(a?3:1,0,d),c},ri=[2,3,1,0],Ll=(e,t)=>{if(!e||e.length!==2&&e.length!==3)throw new Error("Conv requires 2 or 3 inputs");if(e[0].dims.length>5)throw new Error("greater than 5D is not supported");if(e[0].dims.length!==e[1].dims.length)throw new Error("filter does not have same dimension as input");let r=e[0].dims[t.format==="NHWC"?e[0].dims.length-1:1],i=e[1].dims[1]*t.group;if(r!==i)throw new Error("FILTER_IN_CHANNEL should be equal to DATA_CHANNEL");if(e.length===3&&(e[2].dims.length!==1||e[1].dims[0]!==e[2].dims[0]))throw new Error("invalid bias");let n=e[0].dims.length-2;if(t.dilations.length!==n)throw new Error(`dilations should be ${n}D`);if(t.strides.length!==n)throw new Error(`strides should be ${n}D`);if(t.pads.length!==n*2)throw new Error(`pads should be ${n*2}D`);if(t.kernelShape.length!==0&&t.kernelShape.length!==e[1].dims.length-2)throw new Error("invalid kernel shape")},ii=(e,t)=>{let r=e.kernelShape.slice();r.length<t[1].dims.length-2&&r.push(...Array(t[1].dims.length-2-r.length).fill(0));for(let a=2;a<t[1].dims.length;++a)r[a-2]===0&&(r[a-2]=t[1].dims[a]);let i=e.pads.slice();hi.adjustPadsBasedOnAutoPad(t[0].dims,e.strides,e.dilations,r,i,e.format==="NHWC",e.autoPad);let n=Object.assign({},e);return Object.assign(n,{kernelShape:r,pads:i}),n},ma=e=>{let t=Na(e),r=e.format,i=["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][e.auto_pad],n=e.dilations,a=e.group,s=e.kernel_shape,o=e.pads,l=e.strides,d=e.w_is_const();return{autoPad:i,format:r,dilations:n,group:a,kernelShape:s,pads:o,strides:l,wIsConst:d,...t,cacheKey:`${e.format};${t.activation};`}},Cn=(e,t,r,i)=>{let n=r.format==="NHWC",a=Pl(t[0].dims,t[1].dims,r.dilations,r.pads,r.strides,n);if(r.group!==1){let C=[t[0]];if(n){let z=e.kernelCustomData.wT??e.compute(Ue(t[1],ri),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];r.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=z),C.push(z)}else C.push(t[1]);t.length===3&&C.push(t[2]),!e.adapterInfo.isArchitecture("ampere")&&n&&t[1].dims[0]===r.group&&t[1].dims[1]===1&&r.dilations[0]===1&&r.dilations[1]===1?e.compute(af(C,r,a,i),{inputs:C}):e.compute(nf(C,r,a,i),{inputs:C});return}let s=t.length===3,o=t[0].dims[n?1:2],l=t[0].dims[n?2:3],d=t[0].dims[n?3:1],h=t[1].dims[2],c=t[1].dims[3],f=a[n?1:2],y=a[n?2:3],_=a[n?3:1],w=n&&h===o&&c===l&&r.pads[0]===0&&r.pads[1]===0;if(w||h===1&&c===1&&r.dilations[0]===1&&r.dilations[1]===1&&r.strides[0]===1&&r.strides[1]===1&&r.pads[0]===0&&r.pads[1]===0){let C=a[0],z,$,B,W=[];if(n){let P=e.kernelCustomData.wT??e.compute(Ue(t[1],ri),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];if(r.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=P),w){let K=o*l*d;z=t[0].reshape([1,C,K]),$=P.reshape([1,K,_]),B=[1,C,_]}else z=t[0].reshape([C,o*l,d]),$=P.reshape([1,d,_]),B=[C,f*y,_];W.push(z),W.push($)}else z=t[0].reshape([C,d,o*l]),$=t[1].reshape([1,_,d]),B=[C,_,f*y],W.push($),W.push(z);s&&W.push(t[2]);let F=B[2],q=W[0].dims[W[0].dims.length-1];F<8&&q<8?e.compute(La(W,r,a,B,n,i),{inputs:W}):e.compute(mi(W,r,a,B,n,i),{inputs:W});return}let S=!0,v=e.kernelCustomData.wT??e.compute(Ue(t[1],ri),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];r.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=v);let b=[t[0],v];s&&b.push(t[2]);let T=n?f*y:_,E=n?_:f*y,I=h*c*d;e.compute(ef(b,r,a,T,E,I,s,S,i),{inputs:b})},Ul=(e,t)=>{let r=t.format==="NHWC",i=[e.inputs[0].reshape(r?[e.inputs[0].dims[0],1,e.inputs[0].dims[1],e.inputs[0].dims[2]]:[e.inputs[0].dims[0],e.inputs[0].dims[1],1,e.inputs[0].dims[2]]),e.inputs[1].reshape([e.inputs[1].dims[0],e.inputs[1].dims[1],1,e.inputs[1].dims[2]])];e.inputs.length===3&&i.push(e.inputs[2]);let n=[0,t.pads[0],0,t.pads[1]],a=[1].concat(t.strides),s=[1].concat(t.dilations),o=[1].concat(t.kernelShape),l=ii({...t,pads:n,strides:a,dilations:s,kernelShape:o},i);Cn(e,i,l,d=>r?[d[0],d[2],d[3]]:[d[0],d[1],d[3]])},Wl=(e,t,r)=>{let i=r.format==="NHWC"?"channelsLast":"channelsFirst",n=ii(r,t),a=r.autoPad==="NOTSET"?r.pads:r.autoPad,s=tf(t[0].dims,t[1].dims,r.strides,r.dilations,a,!1,i);e.compute(rf(t,n,s.outShape,[s.filterDepth,s.filterHeight,s.filterWidth],[s.padInfo.front,s.padInfo.top,s.padInfo.left],i))},ga=(e,t)=>{if(Ll(e.inputs,t),e.inputs[0].dims.length===3)Ul(e,t);else if(e.inputs[0].dims.length===5)Wl(e,e.inputs,t);else{let r=ii(t,e.inputs);Cn(e,e.inputs,r)}}}),sf,Oy=L(()=>{"use strict";te(),dt(),ne(),ae(),sf=(e,t,r)=>{let i=e.length>2,n=t.outputShape,a=t.format==="NHWC",s=t.group,o=e[1].dims,l=o[2]/s,d=o[3],h=a?Ee(l):1,c=a&&d===1&&l>=4,f=c?Math.floor(l/4)*4:Math.floor(l/h)*h,y=l-f,_=a?Ee(d):1,w=a?d===1?h:_:1,S=R.size(n)/_,v=[Math.ceil(S/64),1,1];pe("verbose",()=>`[conv2d_backprop_webgpu] dispatch = ${v}`);let b=["rank","rank"],T=[t.strides[0],t.strides[1]],E=[t.kernelShape[a?1:2],t.kernelShape[a?2:3]],I=[t.dilations[0],t.dilations[1]],C=[E[0]+(t.dilations[0]<=1?0:(t.kernelShape[a?1:2]-1)*(t.dilations[0]-1)),E[1]+(t.dilations[1]<=1?0:(t.kernelShape[a?2:3]-1)*(t.dilations[1]-1))],z=[C[0]-1-Math.floor((t.pads[0]+t.pads[2])/2),C[1]-1-Math.floor((t.pads[1]+t.pads[3])/2)],$=[{type:12,data:S},{type:12,data:T},{type:12,data:E},{type:12,data:I},{type:12,data:C},{type:6,data:z},{type:12,data:f},{type:12,data:l},{type:12,data:d},...Q(e[0].dims,e[1].dims)];i&&($.push(...Q(e[2].dims)),b.push("rank")),$.push(...Q(n));let B=W=>{let F=[{name:"output_size",type:"u32"},{name:"strides",type:"u32",length:T.length},{name:"filter_dims",type:"u32",length:E.length},{name:"dilations",type:"u32",length:E.length},{name:"effective_filter_dims",type:"u32",length:C.length},{name:"pads",type:"i32",length:z.length},{name:"input_channels_per_group_int",type:"u32"},{name:"input_channels_per_group",type:"u32"},{name:"output_channels_per_group",type:"u32"}],q=ze(e[0].dataType),P=a?1:2,K=a?2:3,O=a?3:1,U=D("W",e[1].dataType,e[1].dims.length,w),J=D("Dy",e[0].dataType,e[0].dims.length,h),re=[J,U];i&&re.push(D("bias",e[2].dataType,[n[O]].length,_));let X=H("result",e[0].dataType,n.length,_),se=()=>{let Y="";if(c)h===4?Y+=`
        let xValue = ${J.getByOffset("x_offset")};
        let wValue = ${U.getByOffset("w_offset")};
        dotProd = dotProd + dot(xValue, wValue);
        x_offset += 1u;
        w_offset += 1u;`:h===2?Y+=`
          dotProd = dotProd + dot(vec4<${q}>(${J.getByOffset("x_offset")}, ${J.getByOffset("x_offset + 1u")}), vec4<${q}>(${U.getByOffset("w_offset")}, ${U.getByOffset("w_offset + 1u")}));
          x_offset += 2u;
          w_offset += 2u;`:h===1&&(Y+=`
          dotProd = dotProd + dot(vec4<${q}>(${J.getByOffset("x_offset")}, ${J.getByOffset("x_offset + 1u")}, ${J.getByOffset("x_offset + 2u")}, ${J.getByOffset("x_offset + 3u")}), vec4<${q}>(${U.getByOffset("w_offset")}, ${U.getByOffset("w_offset + 1u")}, ${U.getByOffset("w_offset + 2u")}, ${U.getByOffset("w_offset + 3u")}));
          x_offset += 4u;
          w_offset += 4u;`);else if(Y+=`
                  let xValue = ${a?J.getByOffset(`${J.indicesToOffset(`${J.type.indices}(batch, idyR, idyC, inputChannel)`)} / ${h}`):J.get("batch","inputChannel","idyR","idyC")};
        `,h===1)Y+=`
          let w_offset = ${U.indicesToOffset(`${U.type.indices}(u32(wRPerm), u32(wCPerm), inputChannel, wOutChannel)`)};
          let wValue = ${U.getByOffset(`w_offset / ${w}`)};
          dotProd = dotProd + xValue * wValue;`;else for(let j=0;j<h;j++)Y+=`
            let wValue${j} = ${U.getByOffset(`${U.indicesToOffset(`${U.type.indices}(u32(wRPerm), u32(wCPerm), inputChannel + ${j}, wOutChannel)`)} / ${w}`)};
            dotProd = dotProd + xValue[${j}] * wValue${j};`;return Y},N=()=>{if(y===0)return"";if(!c)throw new Error(`packInputAs4 ${c} is not true.`);let Y="";if(h===1){Y+="dotProd = dotProd";for(let j=0;j<y;j++)Y+=`
            + ${J.getByOffset(`x_offset + ${j}`)} * ${U.getByOffset(`w_offset + ${j}`)}`;Y+=";"}else if(h===2){if(y!==2)throw new Error(`Invalid inputChannelsRemainder ${y}.`);Y+=`
          let xValue = ${J.getByOffset("x_offset")};
          let wValue = ${U.getByOffset("w_offset")};
          dotProd = dotProd + dot(xValue, wValue);`}return Y},ee=`
            let outputIndices = ${X.offsetToIndices(`global_idx * ${_}`)};
            let batch = ${X.indicesGet("outputIndices",0)};
            let d1 = ${X.indicesGet("outputIndices",O)};
            let r = ${X.indicesGet("outputIndices",P)};
            let c = ${X.indicesGet("outputIndices",K)};
            let dyCorner = vec2<i32>(i32(r), i32(c)) - uniforms.pads;
            let dyRCorner = dyCorner.x;
            let dyCCorner = dyCorner.y;
            let groupId = d1 / uniforms.output_channels_per_group;
            let wOutChannel = d1 - groupId * uniforms.output_channels_per_group;
            // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
            // ? = to be determined. : = across all values in that axis.
            var dotProd = ${X.type.value}(0.0);
            var wR: u32 = 0;
            if (uniforms.dilations.x == 1) {
              // Minimum wR >= 0 that satisfies (dyRCorner + wR) % (uniforms.strides.x) == 0
              wR = u32(((dyRCorner + i32(uniforms.strides.x) - 1) / i32(uniforms.strides.x)) * i32(uniforms.strides.x) - dyRCorner);
            }
            for (; wR < uniforms.effective_filter_dims.x; wR = wR + 1) {
              if (wR % uniforms.dilations.x != 0) {
                continue;
              }
              let dyR = (${q}(dyRCorner) + ${q}(wR)) / ${q}(uniforms.strides[0]);
              let wRPerm = uniforms.filter_dims.x - 1 - wR / uniforms.dilations.x;
              if (dyR < 0.0 || dyR >= ${q}(uniforms.Dy_shape[${P}]) || fract(dyR) > 0.0 ||
                  wRPerm < 0) {
                continue;
              }
              let idyR: u32 = u32(dyR);
              var wC: u32 = 0;
              if (uniforms.dilations.y == 1) {
                // Minimum wC >= 0 that satisfies (dyCCorner + wC) % (uniforms.strides.y) == 0
                wC = u32(((dyCCorner + i32(uniforms.strides.y) - 1) / i32(uniforms.strides.y)) * i32(uniforms.strides.y) - dyCCorner);
              }
              for (; wC < uniforms.effective_filter_dims.y; wC = wC + 1) {
                if (wC % uniforms.dilations.y != 0) {
                  continue;
                }
                let dyC = (${q}(dyCCorner) + ${q}(wC)) / ${q}(uniforms.strides.y);
                let wCPerm = uniforms.filter_dims.y - 1 - wC / uniforms.dilations.y;
                if (dyC < 0.0 || dyC >= ${q}(uniforms.Dy_shape[${K}]) ||
                    fract(dyC) > 0.0 || wCPerm < 0) {
                  continue;
                }
                let idyC: u32 = u32(dyC);
                var inputChannel = groupId * uniforms.input_channels_per_group;
                ${c?`
                var x_offset = ${J.indicesToOffset(`${J.type.indices}(batch, idyR, idyC, inputChannel)`)} / ${h};
                var w_offset = ${U.indicesToOffset(`${U.type.indices}(wRPerm, wCPerm, inputChannel, wOutChannel)`)} / ${w};
                  `:""}
                for (var d2: u32 = 0; d2 < uniforms.input_channels_per_group_int; d2 = d2 + ${c?4:h}) {
                  ${se()}
                  inputChannel = inputChannel + ${c?4:h};
                }
                ${N()}
                wC = wC + uniforms.strides.y - 1;
              }
              wR = wR + uniforms.strides[0] - 1;
            }
            let value = dotProd${i?` + bias[d1 / ${_}]`:""};
            ${X.setByOffset("global_idx","value")};
          `;return`
    ${W.registerUniforms(F).declareVariables(...re,X)}
      ${W.mainStart()}
      ${W.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")};
    ${ee}}`};return{name:"ConvTranspose2D",shaderCache:{hint:`${t.cacheKey};${h}${w}${_}${c}${y}`,inputDependencies:b},getRunData:()=>({dispatchGroup:{x:v[0],y:v[1],z:v[2]},outputs:[{dims:r?r(n):n,dataType:e[0].dataType}],programUniforms:$}),getShaderSource:B}}}),ql,Vl,Gl,zn,of,Fl,On,Hl,uf,Ay=L(()=>{"use strict";Oy(),Ht(),Et(),ql=(e,t,r,i,n,a)=>(e-1)*t+r+(i-1)*n+1-a,Vl=(e,t,r,i,n)=>{let a=Math.floor(e/2);t==="SAME_UPPER"?(r[i]=a,r[n]=e-a):t==="SAME_LOWER"&&(r[i]=e-a,r[n]=a)},Gl=(e,t,r,i,n,a,s,o,l,d)=>{let h=e.length-2,c=d.length===0;l.length<h&&l.push(...Array(h-l.length).fill(0));let f=e[0],y=t[o?3:1]*n;for(let _=0,w=e.length-h-(o?1:0);_<h;++_,++w){let S=e[w],v=c?S*s[_]:d[_],b=ql(S,s[_],a[_],t[w],r[_],v);Vl(b,i,a,_,_+h),c&&d.push(s[_]*(S-1)+l[_]+(t[w]-1)*r[_]+1-a[_]-a[_+h])}d.splice(0,0,f),d.splice(o?3:1,0,y)},zn=(e,t)=>{let r=e.kernelShape.slice();if(e.kernelShape.length===0||e.kernelShape.reduce((c,f)=>c*f,1)===0){r.length=0;for(let c=2;c<t[1].dims.length;++c)r.push(t[1].dims[c])}let i=e.format==="NHWC";r.splice(0,0,t[1].dims[0]),r.splice(i?3:1,0,t[1].dims[1]);let n=e.pads.slice(),a=e.outputShape.slice(),s=e.outputPadding.slice(),o=t[0].dims,l=e.dilations.slice();if(l.reduce((c,f)=>c+f,0)===0){let c=t[0].dims.length-2;l=new Array(c).fill(1)}let d=e.strides.slice();if(d.reduce((c,f)=>c+f,0)===0){let c=t[0].dims.length-2;d=new Array(c).fill(1)}Gl(o,r,l,e.autoPad,e.group,n,d,i,s,a);let h=Object.assign({},e);return Object.assign(h,{kernelShape:r,pads:n,outputPadding:s,outputShape:a,dilations:l,strides:d}),h},of=e=>{let t=Na(e),r=e.format,i=["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][typeof e.autoPad>"u"?0:e.autoPad],n=e.dilations,a=e.group??1,s=e.kernelShape,o=e.pads,l=e.strides,d=e.wIsConst(),h=e.outputPadding,c=e.outputShape;return{autoPad:i,format:r,dilations:n,group:a,kernelShape:s,outputPadding:h,outputShape:c,pads:o,strides:l,wIsConst:d,...t,cacheKey:`${e.format};${t.activation};`}},Fl=(e,t)=>{if(!e||e.length!==2&&e.length!==3)throw new Error("Conv requires 2 or 3 inputs");if(e[0].dims.length!==4&&e[0].dims.length!==3)throw new Error("currently only support 2-dimensional conv");if(e[0].dims.length!==e[1].dims.length)throw new Error("filter does not have same dimension as input");let r=e[0].dims[t.format==="NHWC"?e[0].dims.length-1:1],i=e[1].dims[0];if(r!==i)throw new Error("FILTER_IN_CHANNEL should be equal to DATA_CHANNEL");let n=e[1].dims[1]*t.group;if(e.length===3&&(e[2].dims.length!==1||e[2].dims[0]!==n))throw new Error("invalid bias");let a=e[0].dims.length-2;if(t.dilations.reduce((s,o)=>s+o,0)>0&&t.dilations.length!==a)throw new Error(`dilations should be ${a}D`);if(t.strides.reduce((s,o)=>s+o,0)>0&&t.strides.length!==a)throw new Error(`strides should be ${a}D`);if(t.pads.reduce((s,o)=>s+o,0)>0&&t.pads.length!==a*2)throw new Error(`pads should be ${a*2}D`);if(t.outputPadding.length!==a&&t.outputPadding.length!==0)throw new Error(`output_padding should be ${a}D`);if(t.kernelShape.reduce((s,o)=>s+o,0)>0&&t.kernelShape.length!==0&&t.kernelShape.length!==e[1].dims.length-2)throw new Error("invalid kernel shape");if(t.outputShape.length!==0&&t.outputShape.length!==e[0].dims.length-2)throw new Error("invalid output shape")},On=(e,t,r,i)=>{let n=e.kernelCustomData.wT??e.compute(Ue(t[1],[2,3,0,1]),{inputs:[1],outputs:[r.wIsConst?-2:-1]})[0];r.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=n);let a=[t[0],n];t.length===3&&a.push(t[2]),e.compute(sf(a,r,i),{inputs:a})},Hl=(e,t)=>{let r=t.format==="NHWC",i=[e.inputs[0].reshape(r?[e.inputs[0].dims[0],1,e.inputs[0].dims[1],e.inputs[0].dims[2]]:[e.inputs[0].dims[0],e.inputs[0].dims[1],1,e.inputs[0].dims[2]]),e.inputs[1].reshape([e.inputs[1].dims[0],e.inputs[1].dims[1],1,e.inputs[1].dims[2]])];e.inputs.length===3&&i.push(e.inputs[2]);let n=t.kernelShape;(n.length===0||n[0]===0)&&(n=[e.inputs[1].dims[2]]);let a=t.dilations;(a.length===0||a[0]===0)&&(a=[1]);let s=t.strides;(s.length===0||s[0]===0)&&(s=[1]);let o=t.pads;o.length===0&&(o=[0,0]),o=[0,o[0],0,o[1]],s=[1].concat(s),a=[1].concat(a),n=[1].concat(n);let l=t.outputPadding;l=[0].concat(l);let d=zn({...t,pads:o,strides:s,dilations:a,kernelShape:n,outputPadding:l},i);On(e,i,d,h=>r?[h[0],h[2],h[3]]:[h[0],h[1],h[3]])},uf=(e,t)=>{if(Fl(e.inputs,t),e.inputs[0].dims.length===3)Hl(e,t);else{let r=zn(t,e.inputs);On(e,e.inputs,r)}}}),jl,lf,df,Ry=L(()=>{"use strict";te(),ne(),Ie(),ae(),jl=(e,t,r,i)=>{let n=R.size(t),a=t.length,s=D("input",e,a),o=H("output",e,a),l=r.dataType===6?r.getInt32Array()[0]:Number(r.getBigInt64Array()[0]),d=R.normalizeAxis(l,a),h=c=>{let f=` i32(${s.indicesGet("inputIndices","uniforms.axis")}) `,y=Z("uniforms.input_shape","uniforms.axis",a),_=i.reverse?f+(i.exclusive?" + 1":""):"0",w=i.reverse?y:f+(i.exclusive?"":" + 1");return`
                ${c.registerUniform("outputSize","u32").registerUniform("axis","u32").declareVariables(s,o)}
                ${c.mainStart()}
                  ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
                  var inputIndices = ${o.offsetToIndices("global_idx")};
                  var sum = ${o.type.value}(0);
                  let first : i32 = ${_};
                  let last : i32 = ${w};
                  for (var i : i32 = first; i < last; i++) {
                    ${s.indicesSet("inputIndices","uniforms.axis","u32(i)")};
                    sum = sum + ${s.getByIndices("inputIndices")};
                  }
                  ${o.setByOffset("global_idx","sum")};
                }`};return{name:"CumSum",shaderCache:{hint:i.cacheKey,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:t,dataType:e}],dispatchGroup:{x:Math.ceil(n/64)},programUniforms:[{type:12,data:n},{type:12,data:d},...Q(t,t)]}),getShaderSource:h}},lf=(e,t)=>{let r=e.inputs[0].dims,i=e.inputs[0].dataType,n=e.inputs[1];e.compute(jl(i,r,n,t),{inputs:[0]})},df=e=>{let t=e.exclusive===1,r=e.reverse===1;return fe({exclusive:t,reverse:r})}}),Kl,Xl,Zl,pf,cf,Dy=L(()=>{"use strict";te(),ne(),Ie(),ae(),Kl=e=>{if(!e||e.length!==1)throw new Error("DepthToSpace requires 1 input.");if(e[0].dims.length!==4)throw new Error("DepthToSpace requires 4D input.")},Xl=(e,t,r,i)=>{let n=[];n.push(`fn perm(i: ${i.type.indices}) -> ${r.type.indices} {
    var a: ${r.type.indices};`);for(let a=0;a<t;++a)n.push(r.indicesSet("a",e[a],`i[${a}]`));return n.push("return a;}"),n.join(`
`)},Zl=(e,t)=>{let r,i,n,a,s,o,l=t.format==="NHWC",d=t.blocksize,h=t.mode==="DCR";l?([r,i,n,a]=e.dims,s=h?[r,i,n,d,d,a/d**2]:[r,i,n,a/d**2,d,d],o=h?[0,1,3,2,4,5]:[0,1,4,2,5,3]):([r,i,n,a]=[e.dims[0],e.dims[2],e.dims[3],e.dims[1]],s=h?[r,d,d,a/d**2,i,n]:[r,a/d**2,d,d,i,n],o=h?[0,3,4,1,5,2]:[0,1,4,2,5,3]);let c=e.reshape(s),f=c.dims.length,y=e.dataType,_=D("a",y,f),w=H("output",y,f),S=v=>`
  ${v.registerUniform("output_size","u32").declareVariables(_,w)}

  ${Xl(o,f,_,w)}

  ${v.mainStart()}
    ${v.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let indices = ${w.offsetToIndices("global_idx")};
    let aIndices = perm(indices);

    ${w.setByOffset("global_idx",_.getByIndices("aIndices"))}
  }`;return{name:"DepthToSpace",shaderCache:{hint:`${e.dims};${t.blocksize};${t.mode}`,inputDependencies:["rank"]},getRunData:v=>{let b=l?[r,i*d,n*d,a/d**2]:[r,a/d**2,i*d,n*d],T=R.size(b),E=c.dims,I=R.sortBasedOnPerm(E,o);return{outputs:[{dims:b,dataType:v[0].dataType}],dispatchGroup:{x:Math.ceil(T/64)},programUniforms:[{type:12,data:T},...Q(E,I)]}},getShaderSource:S}},pf=(e,t)=>{Kl(e.inputs),e.compute(Zl(e.inputs[0],t))},cf=e=>fe({blocksize:e.blocksize,mode:e.mode,format:e.format})}),ot,yr,ni,An,bt,Yl,Ql,Jl,Rn,Dn,Mn,ed,td,Bn,rd,hf,ff,My=L(()=>{"use strict";te(),ne(),Ie(),ae(),ot=256,yr=512,ni=2*Math.PI,An=e=>{let t=[],r=e;for(let i of[4,2,3,5])for(;r%i===0;)t.push(i),r/=i;return r===1?t:void 0},bt=e=>{let t=e.toPrecision(9);return/[.eE]/.test(t)?t:`${t}.0`},Yl=(e,t,r,i,n)=>{let a=r/e,s=yr-i,o=d=>`smem[${s}u + base + ${d*t}u]`,l=`  for (var t = local_idx; t < ${a}u; t += ${ot}u) {
`;l+=`    let twiddleIndex = t % ${t}u;
    let angleUnit = f32(twiddleIndex);
`,l+=`    var leg: array<vec2<f32>, 5>;
`;for(let d=0;d<e;d++){let h=`${i}u + t + ${d*a}u`;if(d===0)l+=`    leg[0] = smem[${h}];
`;else{let c=n*ni*d/(e*t);l+=`    { let a = ${bt(c)} * angleUnit; leg[${d}] = cmul(smem[${h}], vec2<f32>(cos(a), sin(a))); }
`}}if(l+=`    let base = (t / ${t}u) * ${t*e}u + twiddleIndex;
`,e===2)l+=`    ${o(0)} = leg[0] + leg[1];
    ${o(1)} = leg[0] - leg[1];
`;else if(e===4){let d=n<0?"vec2<f32>(oddDiff.y, -oddDiff.x)":"vec2<f32>(-oddDiff.y, oddDiff.x)";l+=`    let evenSum = leg[0] + leg[2]; let evenDiff = leg[0] - leg[2];
`,l+=`    let oddSum = leg[1] + leg[3]; let oddDiff = leg[1] - leg[3];
`,l+=`    let oddRot = ${d};
`,l+=`    ${o(0)} = evenSum + oddSum;
    ${o(1)} = evenDiff + oddRot;
`,l+=`    ${o(2)} = evenSum - oddSum;
    ${o(3)} = evenDiff - oddRot;
`}else for(let d=0;d<e;d++){let h=["leg[0]"];for(let c=1;c<e;c++){let f=n*ni*(c*d)/e,y=bt(Math.cos(f)),_=bt(Math.sin(f));h.push(`vec2<f32>(leg[${c}].x*${y} - leg[${c}].y*${_}, leg[${c}].x*${_} + leg[${c}].y*${y})`)}l+=`    ${o(d)} = ${h.join(" + ")};
`}return`${l}  }
  workgroupBarrier();
`},Ql=(e,t,r)=>{let i="",n=1,a=0;for(let s of e)i+=Yl(s,n,t,a,r),n*=s,a=yr-a;return{code:i,resultOffset:a}},Jl=(e,t,r,i,n)=>{let a=e.dims,s=a.length,o=a[s-1],l=a[t],d=r&&i?(l-1)*2:l;n!==void 0&&(d=n);let h=r&&i?1:2,c=i&&!r?Math.floor(d/2)+1:d,f=a.slice();f[t]=c,f[s-1]=h;let y=1;for(let w=t+1;w<s-1;w++)y*=a[w];let _=R.size(a)/o/l;return{dataType:e.dataType,outputDims:f,length:d,signalLength:l,inner:y,batch:_,inputComponents:o,outputComponents:h,outputLength:c,inverse:r,onesided:i}},Rn=(e,t)=>[t,e.length,e.inputComponents,e.outputComponents,e.inverse,e.onesided].join(";"),Dn=e=>[{type:12,data:e.batch},{type:12,data:e.signalLength},{type:12,data:e.inner},{type:12,data:e.outputLength}],Mn=(e,t,r)=>e.registerUniform("batch","u32").registerUniform("signalLength","u32").registerUniform("inner","u32").registerUniform("outputLength","u32").declareVariables(t,r),ed=e=>{let{dataType:t,length:r,inputComponents:i,outputComponents:n,inverse:a,onesided:s}=e,o=Ce(t),l=a?1:-1,d=a?1/r:1,h=An(r),c=f=>{let y=D("x",t,[1]),_=H("y",t,[1]),w=I=>{let C=`inBase + (${I}) * uniforms.inner * ${i}u`,z=`f32(${y.getByOffset(C)})`,$=i===2?`f32(${y.getByOffset(`${C} + 1u`)})`:"0.0";return`vec2<f32>(${z}, ${$})`},S;if(a&&s){let I=Math.floor(r/2)+1,C=r%2===0?`select(provided, provided - 1u, provided == ${I}u)`:"provided";S=`
    let provided = min(uniforms.signalLength, ${I}u);
    for (var i = local_idx; i < ${r}u; i += ${ot}u) {
      if (i < provided) { smem[i] = ${w("i")}; } else { smem[i] = vec2<f32>(0.0); }
    }
    workgroupBarrier();
    for (var k = local_idx + 1u; k < ${C}; k += ${ot}u) {
      let h = smem[k];
      smem[${r}u - k] = vec2<f32>(h.x, -h.y);
    }
    workgroupBarrier();`}else S=`
    let loadCount = min(uniforms.signalLength, ${r}u);
    for (var i = local_idx; i < ${r}u; i += ${ot}u) {
      if (i < loadCount) { smem[i] = ${w("i")}; } else { smem[i] = vec2<f32>(0.0); }
    }
    workgroupBarrier();`;let{code:v,resultOffset:b}=Ql(h,r,l),T=d===1?`smem[${b}u + i]`:`smem[${b}u + i] * ${bt(d)}`,E=n===2?_.setByOffset("off + 1u",`${o}(v.y)`):"";return`
  ${Mn(f,y,_)}
  var<workgroup> smem: array<vec2<f32>, ${2*yr}>;
  fn cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
  }
  ${f.mainStart(ot)}
    let row = workgroup_index;
    if (row >= uniforms.batch) { return; }
    let outer = row / uniforms.inner;
    let within = row % uniforms.inner;
    let inBase = (outer * uniforms.signalLength * uniforms.inner + within) * ${i}u;
    let outBase = (outer * uniforms.outputLength * uniforms.inner + within) * ${n}u;
    ${S}
${v}    for (var i = local_idx; i < uniforms.outputLength; i += ${ot}u) {
      let v = ${T};
      let off = outBase + i * uniforms.inner * ${n}u;
      ${_.setByOffset("off",`${o}(v.x)`)}
      ${E}
    }
  }`};return{name:"DFT",shaderCache:{hint:Rn(e,"fft"),inputDependencies:["type"]},getShaderSource:c,getRunData:()=>({outputs:[{dims:e.outputDims,dataType:t}],programUniforms:Dn(e),dispatchGroup:{x:e.batch}})}},td=e=>{let{dataType:t,length:r,inputComponents:i,outputComponents:n,inverse:a,onesided:s}=e,o=Ce(t),l=a?1:-1,d=a?1/r:1,h=c=>{let f=D("x",t,[1]),y=H("y",t,[1]),_=T=>{let E=`inBase + (${T}) * uniforms.inner * ${i}u`,I=`f32(${f.getByOffset(E)})`,C=i===2?`f32(${f.getByOffset(`${E} + 1u`)})`:"0.0";return`vec2<f32>(${I}, ${C})`},w=a&&s?`fn spectrum(inBase: u32, k: u32) -> vec2<f32> {
    let provided = min(uniforms.signalLength, ${Math.floor(r/2)+1}u);
    if (k < provided) { return ${_("k")}; }
    let m = ${r}u - k;
    if (m < provided) {
      let h = ${_("m")};
      return vec2<f32>(h.x, -h.y);
    }
    return vec2<f32>(0.0, 0.0);
  }`:`fn spectrum(inBase: u32, n: u32) -> vec2<f32> {
    if (n < uniforms.signalLength) { return ${_("n")}; }
    return vec2<f32>(0.0, 0.0);
  }`,S=`
      let angle = ${bt(l*ni)} * f32(knMod) / ${bt(r)};
      acc += cmul(spectrum(inBase, n), vec2<f32>(cos(angle), sin(angle)));
      knMod += k;
      if (knMod >= ${r}u) { knMod -= ${r}u; }`,v=n===2?y.setByOffset("off + 1u",`${o}(v.y)`):"",b=d===1?"acc":`acc * ${bt(d)}`;return`
  ${Mn(c,f,y)}
  fn cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
  }
  ${w}
  ${c.mainStart(ot)}
    let row = workgroup_index;
    if (row >= uniforms.batch) { return; }
    let outer = row / uniforms.inner;
    let within = row % uniforms.inner;
    let inBase = (outer * uniforms.signalLength * uniforms.inner + within) * ${i}u;
    let outBase = (outer * uniforms.outputLength * uniforms.inner + within) * ${n}u;
    for (var k = local_idx; k < uniforms.outputLength; k += ${ot}u) {
      var acc = vec2<f32>(0.0, 0.0);
      var knMod = 0u;
      for (var n = 0u; n < ${r}u; n++) {${S}
      }
      let v = ${b};
      let off = outBase + k * uniforms.inner * ${n}u;
      ${y.setByOffset("off",`${o}(v.x)`)}
      ${v}
    }
  }`};return{name:"DFT",shaderCache:{hint:Rn(e,"direct"),inputDependencies:["type"]},getShaderSource:h,getRunData:()=>({outputs:[{dims:e.outputDims,dataType:t}],programUniforms:Dn(e),dispatchGroup:{x:e.batch}})}},Bn=e=>{if(!e||e.dataType===0)return;if(R.size(e.dims)!==1)throw new Error("DFT optional scalar inputs must have exactly 1 element.");if(e.dataType===6)return e.getInt32Array()[0];let t=Number(e.getBigInt64Array()[0]);if(!Number.isSafeInteger(t))throw new Error("DFT optional scalar inputs are out of JavaScript safe integer range.");return t},rd=e=>{if(!e||e.length<1)throw new Error("DFT requires at least 1 input.");let t=e[0].dims;if(t.length<2)throw new Error("DFT input must have at least 2 dimensions.");let r=t[t.length-1];if(r!==1&&r!==2)throw new Error("DFT input's innermost dimension must be 1 (real) or 2 (complex).")},hf=(e,t)=>{rd(e.inputs);let r=e.inputs[0],i=r.dims.length,n=t.inverse!==0,a=t.onesided!==0,s=Bn(e.inputs[1]);if(s!==void 0&&s<=0)throw new Error("dft_length must be greater than zero.");let o=R.normalizeAxis(Bn(e.inputs[2])??t.axis,i);if(o===i-1)throw new Error("DFT axis must refer to a signal dimension, not the innermost (real/imaginary) dimension.");if(n&&a&&r.dims[i-1]!==2)throw new Error("Inverse one-sided DFT (IRFFT) requires complex-valued input (innermost dimension 2).");let l=Jl(r,o,n,a,s);if(l.length<=0)throw new Error(`Invalid DFT length: ${l.length}`);let d=l.length<=yr&&An(l.length)!==void 0?ed(l):td(l);e.compute(d,{inputs:[0]})},ff=e=>fe({axis:e.axis??1,inverse:e.inverse??0,onesided:e.onesided??0})}),ai,br,Nn,id,nd,ad,sd,Pn,od,mf,gf,By=L(()=>{"use strict";te(),ne(),Ie(),ae(),ai="[a-zA-Z]|\\.\\.\\.",br="("+ai+")+",Nn="^"+br+"$",id="("+br+",)*"+br,nd="^"+id+"$",ad=class{constructor(e=-1){this.symbolToIndices=new Map,this.inputIndex=e}addSymbol(e,t){let r=this.symbolToIndices.get(e);r===void 0?r=[t]:r.push(t),this.symbolToIndices.set(e,r)}},sd=class{constructor(e,t){this.equation=t,this.hasEllipsis=!1,this.symbolToInfo=new Map,this.lhs=new Array,this.outputDims=[];let[r,i]=t.includes("->")?t.split("->",2):[t,""];if(!r.match(RegExp(nd)))throw new Error("Invalid LHS term");if(r.split(",").forEach((n,a)=>{let s=e[a].dims.slice();if(!n.match(RegExp(Nn)))throw new Error("Invalid LHS term");let o=this.processTerm(n,!0,s,a);this.lhs.push(o)}),i==="")i+=[...this.symbolToInfo.entries()].filter(([n,a])=>a.count===1||n==="...").map(([n])=>n).join("");else if(!i.match(RegExp(br)))throw new Error("Invalid RHS");i.match(RegExp(ai,"g"))?.forEach(n=>{if(n==="...")this.outputDims=this.outputDims.concat(this.ellipsisDims);else{let a=this.symbolToInfo.get(n);if(a===void 0)throw new Error("Invalid RHS symbol");this.outputDims.push(a.dimValue)}}),this.rhs=this.processTerm(i,!1,this.outputDims)}addSymbol(e,t,r){let i=this.symbolToInfo.get(e);if(i!==void 0){if(i.dimValue!==t&&i.count!==1)throw new Error("Dimension mismatch");i.count++,i.inputIndices.push(r)}else i={count:1,dimValue:t,inputIndices:[r]};this.symbolToInfo.set(e,i)}processTerm(e,t,r,i=-1){let n=r.length,a=!1,s=[],o=0;if(!e.match(RegExp(Nn))&&!t&&e!=="")throw new Error("Invalid LHS term");let l=e.match(RegExp(ai,"g")),d=new ad(i);return l?.forEach((h,c)=>{if(h==="..."){if(a)throw new Error("Only one ellipsis is allowed per input term");a=!0;let f=n-l.length+1;if(f<0)throw new Error("Ellipsis out of bounds");if(s=r.slice(o,o+f),this.hasEllipsis){if(this.ellipsisDims.length!==s.length||this.ellipsisDims.toString()!==s.toString())throw new Error("Ellipsis dimensions mismatch")}else if(t)this.hasEllipsis=!0,this.ellipsisDims=s;else throw new Error("Ellipsis must be specified in the LHS");for(let y=0;y<s.length;y++){let _=String.fromCharCode(48+y);d.addSymbol(_,c+y),this.addSymbol(_,r[o++],i)}}else d.addSymbol(h,c+(this.hasEllipsis?this.ellipsisDims.length-1:0)),this.addSymbol(h,r[o++],i)}),d}},Pn=e=>e+"_max",od=(e,t,r,i)=>{let n=e.map(d=>d.length).map((d,h)=>D(`input${h}`,t,d)),a=R.size(i),s=H("output",t,i.length),o=[...r.symbolToInfo.keys()].filter(d=>!r.rhs.symbolToIndices.has(d)),l=d=>{let h=[],c="var prod = 1.0;",f="var sum = 0.0;",y="sum += prod;",_=[],w=[],S=[],v=[],b=r.symbolToInfo.size===r.rhs.symbolToIndices.size;r.symbolToInfo.forEach((E,I)=>{if(r.rhs.symbolToIndices.has(I)){let C=r.rhs.symbolToIndices.get(I)?.[0];C!==void 0&&r.lhs.forEach((z,$)=>{if(E.inputIndices.includes($)){let B=z.symbolToIndices.get(I);if(B===void 0)throw new Error("Invalid symbol error");B.forEach(W=>{h.push(`${n[$].indicesSet(`input${$}Indices`,W,s.indicesGet("outputIndices",C))}`)})}})}else r.lhs.forEach((C,z)=>{if(E.inputIndices.includes(z)){let $=C.symbolToIndices.get(I);if($===void 0)throw new Error("Invalid symbol error");$.forEach(B=>{_.push(`${n[z].indicesSet(`input${z}Indices`,B,`${I}`)}`)}),v.push(`prod *= ${n[z].getByIndices(`input${z}Indices`)};`)}}),w.push(`for(var ${I}: u32 = 0; ${I} < uniforms.${Pn(I)}; ${I}++) {`),S.push("}")});let T=b?[...h,`let sum = ${n.map((E,I)=>E.getByIndices(`input${I}Indices`)).join(" * ")};`]:[...h,f,...w,..._,c,...v,y,...S];return`
            ${d.registerUniforms(o.map(E=>({name:`${Pn(E)}`,type:"u32"}))).registerUniform("outputSize","u32").declareVariables(...n,s)}

            ${d.mainStart()}
            ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
            var outputIndices = ${s.offsetToIndices("global_idx")};
            ${n.map((E,I)=>`var input${I}Indices: ${n[I].type.indices};`).join(`
`)}
            ${T.join(`
`)};
            ${s.setByOffset("global_idx","sum")};
          }`};return{name:"Einsum",shaderCache:{hint:r.equation,inputDependencies:e.map(()=>"rank")},getRunData:()=>{let d=o.filter(c=>r.symbolToInfo.has(c)).map(c=>({type:12,data:r.symbolToInfo.get(c)?.dimValue||0}));d.push({type:12,data:a});let h=e.map((c,f)=>[...Q(c)]).reduce((c,f)=>c.concat(f),d);return h.push(...Q(i)),{outputs:[{dims:i,dataType:t}],dispatchGroup:{x:Math.ceil(a/64)},programUniforms:h}},getShaderSource:l}},mf=(e,t)=>{let r=new sd(e.inputs,t.equation),i=r.outputDims,n=e.inputs.map((a,s)=>a.dims);e.compute(od(n,e.inputs[0].dataType,r,i))},gf=e=>{let t=e.equation.replace(/\s+/g,"");return fe({equation:t})}}),ud,Ln,ld,dd,_f,Ny=L(()=>{"use strict";te(),ne(),ae(),ud=e=>{if(!e||e.length!==2)throw new Error("Expand requires 2 input.");let t=e[0].dims,r=Array.from(e[1].getBigInt64Array(),Number),i=r.length<t.length?0:r.length-t.length,n=t.length<r.length?0:t.length-r.length;for(;i<r.length&&n<t.length;++i,++n)if(r[i]!==t[n]&&r[i]!==1&&t[n]!==1)throw new Error("Expand requires shape to be broadcastable to input")},Ln=(e,t)=>{let r=e.length-t.length,i=[];for(let n=0;n<r;++n)i.push(e[n]);for(let n=0;n<t.length;++n)i.push(t[n]===1?e[n+r]:t[n]);return i},ld=(e,t)=>e.length>t.length?Ln(e,t):Ln(t,e),dd=e=>{let t=e[0].dims,r=Array.from(e[1].getBigInt64Array(),Number),i=ld(t,r),n=e[0].dataType,a=n===9||R.size(t)===1,s=n===9||t.length>0&&t[t.length-1]%4===0?4:1,o=a||i.length>0&&i[i.length-1]%4===0?4:1,l=Math.ceil(R.size(i)/o),d=c=>{let f=D("input",n,t.length,s),y=H("output",n,i.length,o),_;if(n===9){let w=(S,v,b="")=>`
          let outputIndices${v} = ${y.offsetToIndices(`outputOffset + ${v}u`)};
          let offset${v} = ${f.broadcastedIndicesToOffset(`outputIndices${v}`,y)};
          let index${v} = offset${v} / 4u;
          let component${v} = offset${v} % 4u;
          ${S}[${v}] = ${b}(${f.getByOffset(`index${v}`)}[component${v}]);
        `;_=`
        let outputOffset = global_idx * ${o};
        var data = vec4<u32>(0);
        ${w("data",0,"u32")}
        ${w("data",1,"u32")}
        ${w("data",2,"u32")}
        ${w("data",3,"u32")}
        ${y.setByOffset("global_idx","data")}
      }`}else _=`
        let outputIndices = ${y.offsetToIndices(`global_idx * ${o}`)};
        let inputOffset = ${f.broadcastedIndicesToOffset("outputIndices",y)};
        let data = ${y.type.value}(${f.getByOffset(`inputOffset / ${s}`)});
        ${y.setByOffset("global_idx","data")}
      }`;return`
    ${c.registerUniform("vec_size","u32").declareVariables(f,y)}
    ${c.mainStart()}
    ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
    ${_}`},h=[{type:12,data:l},...Q(t,i)];return{name:"Expand",shaderCache:{hint:`${i.length};${s}${o}`,inputDependencies:["rank"]},getShaderSource:d,getRunData:()=>({outputs:[{dims:i,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:h})}},_f=e=>{ud(e.inputs),e.compute(dd(e.inputs),{inputs:[0]})}}),pd,yf,Py=L(()=>{"use strict";te(),ne(),ae(),Ba(),pd=e=>{let t=e[0].dataType,r=R.size(e[0].dims),i=R.size(e[1].dims),n=i%4===0,a=s=>{let o=D("x",t,[1],4),l=D("bias",t,[1],4),d=H("y",t,[1],4),h=[{name:"output_vec_size",type:"u32"},{name:"bias_size",type:"u32"}],c=y=>`
      let bias${y}_offset: u32 = (global_idx * 4 + ${y}) % uniforms.bias_size;
      let bias${y} = ${l.getByOffset(`bias${y}_offset / 4`)}[bias${y}_offset % 4];`,f=n?`
      let bias = ${l.getByOffset("global_idx % (uniforms.bias_size / 4)")};`:`${c(0)}${c(1)}${c(2)}${c(3)}
      let bias = ${o.type.value}(bias0, bias1, bias2, bias3);`;return`${s.registerUniforms(h).declareVariables(o,l,d)}

    ${pa(Ce(t))}

    ${s.mainStart(Jt)}
      ${s.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_vec_size")}

      let x = ${o.getByOffset("global_idx")};
      ${f}
      let x_in = x + bias;
      ${d.setByOffset("global_idx",ca("x_in"))}
    }`};return{name:"FastGeluWithBias",shaderCache:{hint:`${n}`,inputDependencies:["type","type"]},getShaderSource:a,getRunData:s=>({outputs:[{dims:s[0].dims,dataType:s[0].dataType}],programUniforms:[{type:12,data:Math.ceil(r/4)},{type:12,data:i}],dispatchGroup:{x:Math.ceil(r/Jt/4)}})}},yf=e=>{e.inputs.length<2||R.size(e.inputs[1].dims)===0?Mh(e):e.compute(pd(e.inputs))}}),cd,hd,bf,wf,Ly=L(()=>{"use strict";te(),ne(),Ie(),ae(),cd=e=>{if(!e||e.length!==2)throw new Error("Gather requires 2 inputs.")},hd=(e,t)=>{let r=e[0].dims,i=e[1].dims,n=r.length,a=R.normalizeAxis(t.axis,n),s=r.slice(0);s.splice(a,1,...i);let o=r[a],l=e[0].dataType===9?4:1,d=Math.ceil(R.size(s)/l),h=[{type:12,data:d},{type:6,data:o},{type:12,data:a},...Q(e[0].dims,e[1].dims,s)],c=f=>{let y=D("data",e[0].dataType,e[0].dims.length,l),_=D("inputIndices",e[1].dataType,e[1].dims.length),w=H("output",e[0].dataType,s.length,l),S=b=>{let T=i.length,E=`var indicesIndices${b}  = ${_.type.indices}(0);`;for(let I=0;I<T;I++)E+=`${T>1?`indicesIndices${b}[${I}]`:`indicesIndices${b}`} = ${s.length>1?`outputIndices${b}[uniforms.axis + ${I}]`:`outputIndices${b}`};`;E+=`
          var idx${b} = ${_.getByIndices(`indicesIndices${b}`)};
          if (idx${b} < 0) {
            idx${b} = idx${b} + uniforms.axisDimLimit;
          }
          var dataIndices${b} : ${y.type.indices};
        `;for(let I=0,C=0;I<n;I++)I===a?(E+=`${n>1?`dataIndices${b}[${I}]`:`dataIndices${b}`} = u32(idx${b});`,C+=T):(E+=`${n>1?`dataIndices${b}[${I}]`:`dataIndices${b}`} = ${s.length>1?`outputIndices${b}[${C}]`:`outputIndices${b}`};`,C++);return E},v;if(e[0].dataType===9){let b=(T,E,I="")=>`
          let outputIndices${E} = ${w.offsetToIndices(`outputOffset + ${E}u`)};
          ${S(E)};
          let offset${E} = ${y.indicesToOffset(`dataIndices${E}`)};
          let index${E} = offset${E} / 4u;
          let component${E} = offset${E} % 4u;
          ${T}[${E}] = ${I}(${y.getByOffset(`index${E}`)}[component${E}]);
        `;v=`
        let outputOffset = global_idx * ${l};
        var value = vec4<u32>(0);
        ${b("value",0,"u32")}
        ${b("value",1,"u32")}
        ${b("value",2,"u32")}
        ${b("value",3,"u32")}
        ${w.setByOffset("global_idx","value")}
      `}else v=`
      let outputIndices = ${w.offsetToIndices("global_idx")};
      ${S("")};
      let value = ${y.getByIndices("dataIndices")};
      ${w.setByOffset("global_idx","value")};
      `;return`
      ${f.registerUniform("outputSize","u32").registerUniform("axisDimLimit","i32").registerUniform("axis","u32").declareVariables(y,_,w)}
      ${f.mainStart()}
        ${f.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
        ${v}
      }`};return{name:"Gather",shaderCache:{hint:t.cacheKey,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:s,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(d/64)},programUniforms:h}),getShaderSource:c}},bf=e=>fe({axis:e.axis}),wf=(e,t)=>{let r=e.inputs;cd(r),e.compute(hd(e.inputs,t))}}),fd,vf,$f,Uy=L(()=>{"use strict";te(),ne(),ae(),fd=(e,t,r,i,n,a,s,o,l)=>{let d=[{type:12,data:a},{type:12,data:i},{type:12,data:n},{type:12,data:r},{type:12,data:s},{type:12,data:o},{type:12,data:l}],h=[a];d.push(...Q(t.dims,h));let c=f=>{let y=D("indices_data",t.dataType,t.dims.length),_=H("input_slice_offsets_data",12,1,1),w=[y,_],S=[{name:"output_size",type:"u32"},{name:"batch_dims",type:"u32"},{name:"input_dims",type:"u32",length:n.length},{name:"sizes_from_slice_dims_data",type:"u32",length:r.length},{name:"num_slices_per_batch",type:"u32"},{name:"input_batch_stride",type:"u32"},{name:"num_slice_dims",type:"u32"}];return`
  ${f.registerUniforms(S).declareVariables(...w)}
  ${f.mainStart()}
    ${f.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let batch_idx = global_idx / uniforms.num_slices_per_batch;
    let base_offset = batch_idx * uniforms.input_batch_stride;

    let slice_indices_base_offset = global_idx * uniforms.num_slice_dims;
    var relative_slice_offset = 0;
    for (var dim_idx = 0u; dim_idx < uniforms.num_slice_dims; dim_idx ++) {
      var index = i32(indices_data[dim_idx + slice_indices_base_offset].x);
      let input_dim_idx = uniforms.batch_dims + dim_idx;
      if (index < 0) {
        ${n.length===1?"index += i32(uniforms.input_dims);":"index += i32(uniforms.input_dims[input_dim_idx]);"}
      }
      ${r.length===1?"relative_slice_offset += index * i32(uniforms.sizes_from_slice_dims_data);":"relative_slice_offset += index * i32(uniforms.sizes_from_slice_dims_data[dim_idx]);"}
    }

    input_slice_offsets_data[global_idx] =  base_offset + u32(relative_slice_offset);
  }`};return e.compute({name:"computeSliceOffsets",shaderCache:{hint:`${n.length}_${r.length}`,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:h,dataType:e.inputs[1].dataType}],dispatchGroup:{x:Math.ceil(a/64)},programUniforms:d}),getShaderSource:c},{inputs:[t],outputs:[-1]})[0]},vf=(e,t)=>{let r=e.inputs,i=r[0].dims,n=r[0].dataType,a=r[1].dims,s=a[a.length-1],o=R.sizeToDimension(a,a.length-1),l=R.sizeFromDimension(i,t.batchDims+s),d=R.sizeToDimension(i,t.batchDims),h=R.sizeFromDimension(i,t.batchDims),c=o/d,f=new Array(s),y=l;for(let E=0;E<s;++E)f[s-1-E]=y,y*=i[t.batchDims+s-1-E];let _=fd(e,r[1],f,t.batchDims,i,o,c,h,s),w=t.batchDims+s;if(w>i.length)throw new Error("last dimension of indices must not be larger than rank of input tensor");let S=a.slice(0,-1).concat(i.slice(w)),v=R.size(S),b=[{type:12,data:v},{type:12,data:l},...Q(r[0].dims,_.dims,S)],T=E=>{let I=D("data",r[0].dataType,r[0].dims.length),C=D("slice_offsets",12,_.dims.length),z=H("output",r[0].dataType,S.length);return`
          ${E.registerUniform("output_size","u32").registerUniform("slice_size","u32").declareVariables(I,C,z)}
            ${E.mainStart()}
            ${E.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          let slice_offset = slice_offsets[global_idx / uniforms.slice_size];
          output[global_idx] = data[u32(slice_offset) + global_idx % uniforms.slice_size];
        }`};e.compute({name:"GatherND",shaderCache:{hint:t.cacheKey,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:S,dataType:n}],dispatchGroup:{x:Math.ceil(v/64)},programUniforms:b}),getShaderSource:T},{inputs:[r[0],_]})},$f=e=>({batchDims:e.batch_dims,cacheKey:""})}),md,gd,xf,Sf,Wy=L(()=>{"use strict";te(),ne(),Ie(),ae(),md=(e,t)=>{if(e.length<3||e.length>4)throw new Error("GatherBlockQuantized requires 3 or 4 inputs.");let r=R.normalizeAxis(t.quantizeAxis,e[0].dims.length),i=t.blockSize,n=e[0],a=e[2],s=e.length===4?e[3]:void 0;if(a.dims.length!==n.dims.length||!n.dims.map((o,l)=>l===r?Math.ceil(o/i)===a.dims[l]:o===a.dims[l]).reduce((o,l)=>o&&l,!0))throw new Error("Scales must have the same rank as the input tensor and the dims should match except on gatherAxis.");if(s){if(s.dataType!==n.dataType)throw new Error("Zero point must have the same data type as the input tensor.");if(s.dims.length!==a.dims.length||!s.dims.map((o,l)=>o===a.dims[l]).reduce((o,l)=>o&&l,!0))throw new Error("Zero point must have the same rank as the input tensor and the dims should match except on quantizeAxis.")}},gd=(e,t)=>{let r=e[0].dims,i=e[1].dims,n=r.length,a=R.normalizeAxis(t.gatherAxis,n),s=R.normalizeAxis(t.quantizeAxis,n),o=r.slice(0);o.splice(a,1,...i);let l=R.size(o),d=e[2].dataType,h=e[0].dataType===22,c=[{type:12,data:l},{type:12,data:s},{type:12,data:a},{type:12,data:t.blockSize},...Q(...e.map((y,_)=>y.dims),o)],f=y=>{let _=D("data",e[0].dataType,e[0].dims.length),w=D("inputIndices",e[1].dataType,e[1].dims.length),S=D("scales",e[2].dataType,e[2].dims.length),v=e.length>3?D("zeroPoint",e[3].dataType,e[3].dims.length):void 0,b=H("output",d,o.length),T=[_,w,S];v&&T.push(v);let E=[{name:"output_size",type:"u32"},{name:"quantize_axis",type:"u32"},{name:"gather_axis",type:"u32"},{name:"block_size",type:"u32"}];return`
        ${y.registerUniforms(E).declareVariables(...T,b)}
        ${y.mainStart()}
        let output_indices = ${b.offsetToIndices("global_idx")};
        var indices_indices = ${w.type.indices}(0);
        ${i.length>1?`
          for (var i: u32 = 0; i < ${i.length}; i++) {
            let index = ${b.indicesGet("output_indices","uniforms.gather_axis + i")};
            ${w.indicesSet("indices_indices","i","index")};
          }`:`indices_indices = ${b.indicesGet("output_indices","uniforms.gather_axis")};`};
        var data_indices = ${_.type.indices}(0);
        for (var i: u32 = 0; i < uniforms.gather_axis; i++) {
          let index = ${b.indicesGet("output_indices","i")};
          ${_.indicesSet("data_indices","i","index")};
        }
        var index_from_indices = ${w.getByIndices("indices_indices")};
        if (index_from_indices < 0) {
          index_from_indices += ${r[a]};
        }
        ${_.indicesSet("data_indices","uniforms.gather_axis","u32(index_from_indices)")};
        for (var i = uniforms.gather_axis + 1; i < ${o.length}; i++) {
          let index = ${b.indicesGet("output_indices",`i + ${i.length} - 1`)};
          ${_.indicesSet("data_indices","i","index")};
        }
        let data_offset = ${_.indicesToOffset("data_indices")};
        let data_index = data_offset % 8;
        // Convert 4-bit packed data to 8-bit packed data.
        let packed_4bit_quantized_data = ${_.getByOffset("data_offset / 8")};
        let packed_8bit_quantized_data = (packed_4bit_quantized_data >> (4 * (data_index % 2))) & 0x0f0f0f0f;
        let quantized_data_vec = ${h?"unpack4xI8":"unpack4xU8"}(u32(packed_8bit_quantized_data));
        let quantized_data = quantized_data_vec[data_index / 2];
        var scale_indices = data_indices;
        let quantize_axis_index = ${S.indicesGet("data_indices","uniforms.quantize_axis")} / uniforms.block_size;
        ${S.indicesSet("scale_indices","uniforms.quantize_axis","quantize_axis_index")};
        var scale = ${S.getByIndices("scale_indices")};
        ${v?`
              let zero_point_indices = scale_indices;
              let zero_point_offset = ${v.indicesToOffset("zero_point_indices")};
              let zero_point_index = zero_point_offset % 8;
              let packed_4bit_zero_points = ${v.getByOffset("zero_point_offset / 8")};
              let packed_8bit_zero_points = (packed_4bit_zero_points >> (4 * (zero_point_index % 2))) & 0x0f0f0f0f;
              let zero_point_vec = ${h?"unpack4xI8":"unpack4xU8"}(u32(packed_8bit_zero_points));
              let zero_point = zero_point_vec[zero_point_index / 2];`:"var zero_point = 0"};
        let dequantized_data = ${Ce(d)}(quantized_data - zero_point) * scale;
        ${b.setByOffset("global_idx","dequantized_data")};
    }`};return{name:"GatherBlockQuantized",shaderCache:{hint:`${t.cacheKey};${e.filter((y,_)=>_!==1).map(y=>y.dims.join("_")).join(";")}`,inputDependencies:Array.from({length:e.length},(y,_)=>"rank")},getRunData:()=>({outputs:[{dims:o,dataType:d}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:c}),getShaderSource:f}},xf=(e,t)=>{let r=e.inputs;md(r,t),e.compute(gd(e.inputs,t))},Sf=e=>fe({blockSize:e.blockSize,gatherAxis:e.gatherAxis,quantizeAxis:e.quantizeAxis})}),_d,yd,Tf,Ef,qy=L(()=>{"use strict";te(),ne(),Ie(),ae(),_d=e=>{if(!e||e.length!==2)throw new Error("GatherElements requires 2 inputs.");if(e[0].dims.length<1)throw new Error("GatherElements requires that the data input be rank >= 1.");if(e[0].dims.length!==e[1].dims.length)throw new Error(`GatherElements requires that the data input and
                     indices input tensors be of same rank.`)},yd=(e,t)=>{let r=e[0].dims,i=e[0].dataType,n=r.length,a=e[1].dims,s=e[1].dataType,o=R.normalizeAxis(t.axis,n),l=r[o],d=a.slice(0),h=R.size(d),c=D("input",i,n),f=D("indicesInput",s,a.length),y=H("output",i,d.length),_=[{type:12,data:h},{type:6,data:l},{type:12,data:o}];return _.push(...Q(r,a,d)),{name:"GatherElements",shaderCache:{inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:d,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(h/64)},programUniforms:_}),getShaderSource:w=>`
      ${w.registerUniform("outputSize","u32").registerUniform("axisDimLimit","i32").registerUniform("axis","u32").declareVariables(c,f,y)}
      ${w.mainStart()}
      ${w.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

      let outputIndices = ${y.offsetToIndices("global_idx")};

      var idx = ${f.getByOffset("global_idx")};
      if (idx < 0) {
        idx = idx + uniforms.axisDimLimit;
      }
      var inputIndices = ${c.type.indices}(outputIndices);
      ${c.indicesSet("inputIndices","uniforms.axis","u32(idx)")};
      let value = ${c.getByIndices("inputIndices")};

      ${y.setByOffset("global_idx","value")};
  }`}},Tf=e=>fe({axis:e.axis}),Ef=(e,t)=>{let r=e.inputs;_d(r),e.compute(yd(e.inputs,t))}}),bd,wd,If,kf,Vy=L(()=>{"use strict";te(),ne(),ae(),bd=e=>{if(!e)throw new Error("Input is missing");if(e.length<2||e.length>3)throw new Error("Invaid input number.");if(e.length===3&&e[2].dims.length>2)throw new Error("Invalid input shape of C");if(e[0].dataType!==e[1].dataType||e.length===3&&e[0].dataType!==e[2].dataType)throw new Error("Input types are mismatched")},wd=(e,t)=>{let r=e[0].dims.slice(),i=e[1].dims.slice(),[n,a,s]=vc.getShapeOfGemmResult(r,t.transA,i,t.transB,e.length===3?e[2].dims:void 0),o=[n,a];if(!o)throw new Error("Can't use gemm on the given tensors");let l=16,d=Math.ceil(a/l),h=Math.ceil(n/l),c=!0,f=R.size(o),y=[{type:12,data:c?d:f},{type:12,data:n},{type:12,data:a},{type:12,data:s},{type:1,data:t.alpha},{type:1,data:t.beta}],_=["type","type"];e.length===3&&(y.push(...Q(e[2].dims)),_.push("rank")),y.push(...Q(o));let w=v=>{let b="";t.transA&&t.transB?b="value += a[k * uniforms.M + m] * b[n * uniforms.K + k];":t.transA&&!t.transB?b="value += a[k * uniforms.M + m] * b[k * uniforms.N + n];":!t.transA&&t.transB?b="value += a[m * uniforms.K + k] * b[n * uniforms.K + k];":!t.transA&&!t.transB&&(b="value += a[m * uniforms.K + k] * b[k * uniforms.N + n];");let T=t.alpha===1?"":"value *= uniforms.alpha;",E=D("a",e[0].dataType,e[0].dims),I=D("b",e[1].dataType,e[1].dims),C=E.type.value,z=null,$=[E,I];e.length===3&&(z=D("c",e[2].dataType,e[2].dims.length),$.push(z));let B=H("output",e[0].dataType,o.length);$.push(B);let W=[{name:"output_size",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"},{name:"alpha",type:"f32"},{name:"beta",type:"f32"}];return`
  ${v.registerUniforms(W).declareVariables(...$)}

  ${v.mainStart()}
    ${v.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let m = global_idx / uniforms.N;
    let n = global_idx % uniforms.N;

    var value = ${C}(0);
    for (var k: u32 = 0u; k < uniforms.K; k++) {
      ${b}
    }

    ${T}
    ${z!=null?`let cOffset = ${z.broadcastedIndicesToOffset("vec2(m, n)",B)}; value += ${C}(uniforms.beta) * ${z.getByOffset("cOffset")};`:""}
    output[global_idx] = value;
  }`},S=v=>{let b=D("a",e[0].dataType,e[0].dims),T=D("b",e[1].dataType,e[1].dims),E=null,I=[b,T];e.length===3&&(E=D("c",e[2].dataType,e[2].dims.length),I.push(E));let C=H("output",e[0].dataType,o.length);I.push(C);let z=[{name:"num_tile_n",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"},{name:"alpha",type:"f32"},{name:"beta",type:"f32"}],$="",B="";t.transA&&t.transB?(B=`
      var col = tile_row_start + local_id.x;
      var row = k_start + local_id.y;
      if (col < uniforms.M && row < uniforms.K) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.M + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${b.type.value}(0);
      }

      col = k_start + local_id.x;
      row = tile_col_start + local_id.y;
      if (col < uniforms.K && row < uniforms.N) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.K + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${T.type.value}(0);
      }
      `,$="value += tile_a[k][local_id.y] * tile_b[local_id.x][k];"):t.transA&&!t.transB?(B=`
      var col = tile_row_start + local_id.x;
      var row = k_start + local_id.y;
      if (col < uniforms.M && row < uniforms.K) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.M + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${b.type.value}(0);
      }

      col = tile_col_start + local_id.x;
      row = k_start + local_id.y;
      if (col < uniforms.N && row < uniforms.K) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.N + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${T.type.value}(0);
      }
      `,$="value += tile_a[k][local_id.y] * tile_b[k][local_id.x];"):!t.transA&&t.transB?(B=`
      var col = k_start + local_id.x;
      var row = tile_row_start + local_id.y;
      if (col < uniforms.K && row < uniforms.M) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.K + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${b.type.value}(0);
      }

      col = k_start + local_id.x;
      row = tile_col_start + local_id.y;
      if (col < uniforms.K && row < uniforms.N) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.K + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${T.type.value}(0);
      }
      `,$="value += tile_a[local_id.y][k] * tile_b[local_id.x][k];"):!t.transA&&!t.transB&&(B=`
      var col = k_start + local_id.x;
      var row = tile_row_start + local_id.y;
      if (col < uniforms.K && row < uniforms.M) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.K + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${b.type.value}(0);
      }

      col = tile_col_start + local_id.x;
      row = k_start + local_id.y;
      if (col < uniforms.N && row < uniforms.K) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.N + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${T.type.value}(0);
      }
      `,$="value += tile_a[local_id.y][k] * tile_b[k][local_id.x];");let W=t.alpha===1?"":"value *= uniforms.alpha;";return`
  ${v.registerUniforms(z).declareVariables(...I)}
  var<workgroup> tile_a: array<array<${b.type.storage}, ${l}>, ${l}>;
  var<workgroup> tile_b: array<array<${T.type.storage}, ${l}>, ${l}>;
  ${v.mainStart([l,l,1])}
    let tile_col_start = (workgroup_index % uniforms.num_tile_n) * ${l};
    let tile_row_start = (workgroup_index / uniforms.num_tile_n) * ${l};
    let num_tiles = (uniforms.K - 1) / ${l} + 1;
    var k_start = 0u;
    var value = ${C.type.value}(0);
    for (var t: u32 = 0u; t < num_tiles; t++) {
      ${B}
      k_start = k_start + ${l};
      workgroupBarrier();

      for (var k: u32 = 0u; k < ${l}; k++) {
        ${$}
      }
      workgroupBarrier();
    }

    ${W}
    let m = tile_row_start + local_id.y;
    let n = tile_col_start + local_id.x;
    ${E!=null?`let cOffset = ${E.broadcastedIndicesToOffset("vec2(m, n)",C)}; value += ${C.type.value}(uniforms.beta) * ${E.getByOffset("cOffset")};`:""}
    if (m < uniforms.M && n < uniforms.N) {
      output[m * uniforms.N + n] = value;
    }
  }`};return c?{name:"GemmShared",shaderCache:{hint:`${t.cacheKey}`,inputDependencies:_},getRunData:()=>({outputs:[{dims:o,dataType:e[0].dataType}],dispatchGroup:{x:d*h},programUniforms:y}),getShaderSource:S}:{name:"Gemm",shaderCache:{hint:`${t.cacheKey}`,inputDependencies:_},getRunData:()=>({outputs:[{dims:o,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(f/64)},programUniforms:y}),getShaderSource:w}},If=e=>{let t=e.transA,r=e.transB,i=e.alpha,n=e.beta;return{transA:t,transB:r,alpha:i,beta:n,cacheKey:`${e.transA};${e.transB};${e.alpha===1}`}},kf=(e,t)=>{bd(e.inputs),e.compute(wd(e.inputs,t))}}),nt,ut,Dt,Mt,vd,$d,xd,Sd,Td,Ed,Id,kd,Cf,zf,Gy=L(()=>{"use strict";te(),ne(),Ie(),ae(),[nt,ut,Dt,Mt]=[0,1,2,3],vd=e=>{if(e[0].dims.length!==4)throw new Error("only 4-D tensor is supported.");if(e[0].dims.length!==e[1].dims.length)throw new Error("input dimensions must be equal to grid dimensions");if(e[0].dims.length-2!==e[1].dims[e[1].dims.length-1])throw new Error(`last dimension of grid must be equal to ${e[0].dims.length-2}`);if(e[0].dims[0]!==e[1].dims[0])throw new Error("grid batch size must match input batch size")},$d=`
  fn gs_get_cubic_coeffs(x: f32) -> vec4<f32> {
    let cubic_alpha = -0.75f;
    let x_abs = abs(x);
    var coeffs: vec4<f32>;
    coeffs[0] = (((cubic_alpha * (x_abs + 1) - 5 * cubic_alpha) * (x_abs + 1) + 8 * cubic_alpha) * (x_abs + 1) - 4 * cubic_alpha);
    coeffs[1] = (((cubic_alpha + 2) * x_abs - (cubic_alpha + 3)) * x_abs * x_abs + 1);
    coeffs[2] = (((cubic_alpha + 2) * (1 - x_abs) - (cubic_alpha + 3)) * (1 - x_abs) * (1 - x_abs) + 1);
    coeffs[3] = (((cubic_alpha * (2 - x_abs) - 5 * cubic_alpha) * (2 - x_abs) + 8 * cubic_alpha) * (2 - x_abs) - 4 * cubic_alpha);
    return coeffs;
  }
`,xd=e=>`
  fn gs_bicubic_interpolate(p: mat4x4<${e}>, x: f32, y: f32) -> ${e} {
    var v: vec4<f32>;
    var coeffs = gs_get_cubic_coeffs(x);
    for (var i = 0; i < 4; i++) {
      v[i] = coeffs[0] * p[i][0] + coeffs[1] * p[i][1] + coeffs[2] * p[i][2] + coeffs[3] * p[i][3];
    }
    coeffs = gs_get_cubic_coeffs(y);
    let pixel = ${e}(coeffs[0] * v[0] + coeffs[1] * v[1] + coeffs[2] * v[2] + coeffs[3] * v[3]);
    return pixel;
  }
`,Sd=e=>`
  fn gs_denormalize(n: f32, length: i32) -> f32 {
    ${e.alignCorners===0?`
    // alignCorners: false => [-1, 1] to [-0.5, length - 0.5]
    return ((n + 1.0) * f32(length) - 1.0) / 2.0;
    `:`
    // alignCorners: true => [-1, 1] to [0, length - 1]
    return (n + 1.0) / 2.0 * (f32(length - 1));
    `}
  }
`,Td=e=>`
  ${e.paddingMode==="reflection"?`
      fn gs_reflect(x: i32, x_min: f32, x_max: f32) -> u32 {
        var dx = 0.0;
        var fx = f32(x);
        let range = x_max - x_min;
        if (fx < x_min) {
          dx = x_min - fx;
          let n = u32(dx / range);
          let r = dx - f32(n) * range;
          if (n % 2 == 0) {
            fx = x_min + r;
          } else {
            fx = x_max - r;
          }
        } else if (fx > x_max) {
          dx = fx - x_max;
          let n = u32(dx / range);
          let r = dx - f32(n) * range;
          if (n % 2 == 0) {
            fx = x_max - r;
          } else {
            fx = x_min + r;
          }
        }
        return u32(fx);
      }`:""}
`,Ed=(e,t,r)=>`
  fn pixel_at_grid(r: i32, c: i32, H: i32, W: i32, batch: u32, channel: u32, border: vec4<f32>) -> ${t} {
     var pixel = ${t}(0);
     var indices = vec4<u32>(0);
     indices[${nt}] = batch;
     indices[${ut}] = channel;`+(()=>{switch(r.paddingMode){case"zeros":return`
          if (r >= 0 && r < H && c >=0 && c < W) {
            indices[${Dt}] = u32(r);
            indices[${Mt}] = u32(c);
          } else {
            return ${t}(0);
          }
        `;case"border":return`
          indices[${Dt}] = u32(clamp(r, 0, H - 1));
          indices[${Mt}] = u32(clamp(c, 0, W - 1));
        `;case"reflection":return`
          indices[${Dt}] = gs_reflect(r, border[1], border[3]);
          indices[${Mt}] = gs_reflect(c, border[0], border[2]);
        `;default:throw new Error(`padding mode ${r.paddingMode} is not supported`)}})()+`
    return ${e.getByIndices("indices")};
  }
`,Id=(e,t,r)=>(()=>{switch(r.mode){case"nearest":return`
          let result = pixel_at_grid(i32(round(y)), i32(round(x)), H_in, W_in, indices[${nt}], indices[${ut}], border);
        `;case"bilinear":return`
          let x1 = i32(floor(x));
          let y1 = i32(floor(y));
          let x2 = x1 + 1;
          let y2 = y1 + 1;

          let p11 = pixel_at_grid(y1, x1, H_in, W_in, indices[${nt}], indices[${ut}], border);
          let p12 = pixel_at_grid(y1, x2, H_in, W_in, indices[${nt}], indices[${ut}], border);
          let p21 = pixel_at_grid(y2, x1, H_in, W_in, indices[${nt}], indices[${ut}], border);
          let p22 = pixel_at_grid(y2, x2, H_in, W_in, indices[${nt}], indices[${ut}], border);

          let dx2 = ${t}(f32(x2) - x);
          let dx1 = ${t}(x - f32(x1));
          let dy2 = ${t}(f32(y2) - y);
          let dy1 = ${t}(y - f32(y1));
          let result = dy2 * (dx2 * p11 + dx1 * p12) + dy1 * (dx2 * p21 + dx1 * p22);
        `;case"bicubic":return`
          let x0 = i32(floor(x)) - 1;
          let y0 = i32(floor(y)) - 1;
          var p: mat4x4<${t}>;
          for (var h = 0; h < 4; h++) {
            for (var w = 0; w < 4; w++) {
              p[h][w] = pixel_at_grid(h + y0, w + x0, H_in, W_in, indices[${nt}], indices[${ut}], border);
            }
          }

          let dx = x - f32(x0 + 1);
          let dy = y - f32(y0 + 1);
          let result = gs_bicubic_interpolate(p, dx, dy);
        `;default:throw new Error(`mode ${r.mode} is not supported`)}})()+`${e.setByOffset("global_idx","result")}`,kd=(e,t)=>{let r=D("x",e[0].dataType,e[0].dims.length),i=[e[1].dims[0],e[1].dims[1],e[1].dims[2]],n=D("grid",e[1].dataType,i.length,2),a=[e[0].dims[0],e[0].dims[1],e[1].dims[1],e[1].dims[2]];t.format==="NHWC"&&(a=[e[0].dims[0],e[1].dims[1],e[1].dims[2],e[0].dims[3]],[nt,ut,Dt,Mt]=[0,3,1,2]);let s=H("output",e[0].dataType,a.length),o=r.type.value,l=R.size(a),d=[{type:12,data:l},...Q(e[0].dims,i,a)],h=c=>`
  ${c.registerUniform("output_size","u32").declareVariables(r,n,s)}
  ${$d}
  ${xd(o)}
  ${Sd(t)}
  ${Td(t)}
  ${Ed(r,o,t)}

  ${c.mainStart()}
    ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let H_in = i32(uniforms.x_shape[${Dt}]);
      let W_in = i32(uniforms.x_shape[${Mt}]);

      ${t.alignCorners===0?`
      let x_min = -0.5;
      let x_max = f32(W_in) - 0.5;
      let y_min = -0.5;
      let y_max = f32(H_in) - 0.5;
      `:`
      let x_min = 0.0;
      let x_max = f32(W_in) - 1.0;
      let y_min = 0.0;
      let y_max = f32(H_in) - 1.0;
      `};
      let border = vec4<f32>(x_min, y_min, x_max, y_max);

      let indices = ${s.offsetToIndices("global_idx")};
      var grid_indices = vec3<u32>(indices[${nt}], indices[${Dt}], indices[${Mt}]);
      let nxy = ${n.getByIndices("grid_indices")};
      var x = gs_denormalize(f32(nxy[0]), W_in);
      var y = gs_denormalize(f32(nxy[1]), H_in);

      ${Id(s,o,t)}
  }`;return{name:"GridSample",shaderCache:{hint:`${t.cacheKey}`,inputDependencies:["type","type"]},getRunData:c=>{let f=R.size(a);return{outputs:[{dims:a,dataType:c[0].dataType}],dispatchGroup:{x:Math.ceil(f/64)},programUniforms:d}},getShaderSource:h}},Cf=(e,t)=>{vd(e.inputs),e.compute(kd(e.inputs,t))},zf=e=>fe({alignCorners:e.align_corners,mode:e.mode,paddingMode:e.padding_mode,format:e.format})}),Me,Cd,Of,Un,zd,Er,Af,Rf=L(()=>{"use strict";te(),ne(),Ie(),Aa(),Ma(),ae(),Et(),Me=(e,t)=>e.length>t&&e[t].dims.length>0?e[t]:void 0,Cd=(e,t)=>{let r=e[0],i=Me(e,1),n=Me(e,2),a=Me(e,3),s=Me(e,4),o=Me(e,5),l=Me(e,6),d=Me(e,7);if(r.dims.length!==3&&r.dims.length!==5)throw new Error("Input query is expected to have 3 or 5 dimensions");let h=r.dims[0],c=r.dims[1],f=r.dims.length===3?r.dims[2]:t.numHeads*r.dims[4],y=c,_=0,w=0,S=Math.floor(f/t.numHeads);if(l&&d&&R.size(l.dims)&&R.size(d.dims)){if(l.dims.length!==4)throw new Error('Input "past_key" is expected to have 4 dimensions');if(l.dims[0]!==h||l.dims[1]!==t.numHeads||l.dims[3]!==S)throw new Error('Input "past_key" shape (batch_size, num_heads, past_sequence_length, head_size)');if(d.dims[0]!==h||d.dims[1]!==t.numHeads||d.dims[3]!==S)throw new Error('Input "past_value" shape (batch_size, num_heads, past_sequence_length, head_size)');if(l.dims[2]!==d.dims[2])throw new Error('Input "past_key" and "past_value" shall have same dim 2 (past_sequence_length)');if(d.dims.length!==4)throw new Error('Input "past_value" is expected to have 4 dimensions');_=l.dims[2],w=l.dims[2]}else if(l&&R.size(l.dims)||d&&R.size(d.dims))throw new Error('Input "past_key" and "past_value" shall be both present or both absent');let v;if(i&&R.size(i.dims)>0){if(r.dims.length!==3)throw new Error('Input "query" is expected to have 3 dimensions when key is given');if(i.dims.length<3||i.dims.length>5)throw new Error('Input "key" is expected to have 3, 4, or 5 dimensions');if(r.dims[0]!==i.dims[0])throw new Error('Input "query" and "key" shall have same dim 0 (batch size)');if(i.dims.length===3){if(i.dims[2]!==r.dims[2])throw new Error('Input "query" and "key" shall have same dim 2 (hidden_size)');v=2,y=i.dims[1]}else if(i.dims.length===5){if(i.dims[2]!==t.numHeads||i.dims[3]!==2||i.dims[4]!==S)throw new Error('Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv');if(n)throw new Error('Expect "value" be none when "key" has packed kv format.');v=5,y=i.dims[1]}else{if(i.dims[1]!==t.numHeads||i.dims[3]!==S)throw new Error('Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key');v=0,y=i.dims[2]}}else{if(r.dims.length!==5)throw new Error('Input "query" is expected to have 5 dimensions when key is empty');if(r.dims[2]!==t.numHeads||r.dims[3]!==3)throw new Error('Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv');v=3}if(a&&R.size(a.dims)>0){if(a.dims.length!==1)throw new Error('Input "bias" is expected to have 1 dimension');if(i&&i.dims.length===5&&i.dims[3]===2)throw new Error("bias is not allowed for packed kv.")}let b=_+y,T=0;if(s&&R.size(s.dims)>0){T=8;let z=s.dims;throw z.length===1?z[0]===h?T=1:z[0]===3*h+2&&(T=3):z.length===2&&z[0]===h&&z[1]===b&&(T=5),T===8?new Error('Input "key_padding_mask" shape shall be (batch_size) or (batch_size, total_sequence_length)'):new Error("Mask not supported")}let E=!1,I=f;if(n&&R.size(n.dims)>0){if(n.dims.length!==3&&n.dims.length!==4)throw new Error('Input "value" is expected to have 3 or 4 dimensions');if(r.dims[0]!==n.dims[0])throw new Error('Input "query" and "value" shall have same dim 0 (batch_size)');if(n.dims.length===3){if(y!==n.dims[1])throw new Error('Input "key" and "value" shall have the same dim 1 (kv_sequence_length)');I=n.dims[2]}else{if(y!==n.dims[2])throw new Error('Input "key" and "value" shall have the same dim 2 (kv_sequence_length)');I=n.dims[1]*n.dims[3],E=!0}}let C=!1;if(s&&R.size(s.dims)>0)throw new Error("Key padding mask is not supported");if(o&&R.size(o.dims)>0){if(o.dims.length!==4)throw new Error('Input "attention_bias" is expected to have 4 dimensions');if(o.dims[0]!==h||o.dims[1]!==t.numHeads||o.dims[2]!==c||o.dims[3]!==b)throw new Error('Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)')}return{batchSize:h,sequenceLength:c,pastSequenceLength:_,kvSequenceLength:y,totalSequenceLength:b,maxSequenceLength:w,inputHiddenSize:0,hiddenSize:f,vHiddenSize:I,headSize:S,vHeadSize:Math.floor(I/t.numHeads),numHeads:t.numHeads,isUnidirectional:!1,pastPresentShareBuffer:!1,maskFilterValue:t.maskFilterValue,maskType:T,scale:t.scale,broadcastResPosBias:C,passPastInKv:E,qkvFormat:v}},Of=e=>fe({...e}),Un=fe({perm:[0,2,1,3]}),zd=(e,t,r,i,n,a,s)=>{let o=[i,n,a],l=R.size(o),d=[{type:12,data:l},{type:12,data:s},{type:12,data:a}],h=c=>{let f=H("qkv_with_bias",t.dataType,o),y=D("qkv",t.dataType,o),_=D("bias",r.dataType,o),w=[{name:"output_size",type:"u32"},{name:"bias_offset",type:"u32"},{name:"hidden_size",type:"u32"}];return`
  ${c.registerUniforms(w).declareVariables(y,_,f)}
  ${c.mainStart()}
    ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let bias_offset_idx = (global_idx % uniforms.hidden_size) + uniforms.bias_offset;

    qkv_with_bias[global_idx] = qkv[global_idx] + bias[bias_offset_idx];
  }`};return e.compute({name:"MultiHeadAttentionAddBias",shaderCache:{inputDependencies:["type","type"]},getRunData:()=>({outputs:[{dims:o,dataType:t.dataType,gpuDataType:0}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:d}),getShaderSource:h},{inputs:[t,r],outputs:[-1]})[0]},Er=(e,t,r,i,n,a,s,o)=>{let l=a;if(s&&R.size(s.dims)>0){if(i===1)throw new Error("AddBiasReshape is not implemented. Please export your model with packed QKV or KV");return l=zd(e,a,s,t,i,r*n,o),l=l.reshape([t,i,r,n]),r===1||i===1?l:e.compute(Ue(l,Un.perm),{inputs:[l],outputs:[-1]})[0]}else return a.dims.length===3&&(l=a.reshape([t,i,r,n])),r===1||i===1?l:e.compute(Ue(l,Un.perm),{inputs:[l],outputs:[-1]})[0]},Af=(e,t)=>{let r=Cd(e.inputs,t),i=e.inputs[0],n=Me(e.inputs,1),a=Me(e.inputs,2),s=Me(e.inputs,3),o=Me(e.inputs,4),l=Me(e.inputs,5),d=Me(e.inputs,6),h=Me(e.inputs,7);if(i.dims.length===5)throw new Error("Packed QKV is not implemented");if(n?.dims.length===5)throw new Error("Packed KV is not implemented");let c=n&&a&&n.dims.length===4&&a.dims.length===4,f=Er(e,r.batchSize,r.numHeads,r.sequenceLength,r.headSize,i,s,0);if(c)return zr(e,f,n,a,o,void 0,d,h,l,r);if(!n||!a)throw new Error("key and value must be provided");let y=Er(e,r.batchSize,r.numHeads,r.kvSequenceLength,r.headSize,n,s,r.hiddenSize),_=Er(e,r.batchSize,r.numHeads,r.kvSequenceLength,r.vHeadSize,a,s,2*r.hiddenSize);zr(e,f,y,_,o,void 0,d,h,l,r)}}),Od,Ad,Rd,Dd,_a,Df,Mf,Bf=L(()=>{"use strict";te(),ne(),Ie(),ae(),Od=e=>{if(!e||e.length<1)throw new Error("too few inputs")},Ad=(e,t)=>{let r=[],i=t.numOutputs;return e[1].dims[0]>0&&(e[1].getBigInt64Array().forEach(n=>r.push(Number(n))),i=r.length),fe({numOutputs:i,axis:t.axis,splitSizes:r})},Rd=e=>`
fn calculateOutputIndex(index: u32) -> u32 {
    for (var i: u32 = 0u; i < ${e}u; i += 1u ) {
    if (index < ${Z("uniforms.size_in_split_axis","i",e)}) {
        return i;
    }
    }
    return ${e}u;
}`,Dd=e=>{let t=e.length,r=[];for(let i=0;i<t;++i){let n=e[i].setByIndices("indices","input[global_idx]");t===1?r.push(n):i===0?r.push(`if (output_number == ${i}u) { ${n} }`):i===t-1?r.push(`else { ${n} }`):r.push(`else if (output_number == ${i}) { ${n} }`)}return`
      fn writeBufferData(output_number: u32, indices: ${e[0].type.indices}, global_idx: u32) {
        ${r.join(`
`)}
      }`},_a=(e,t)=>{let r=e[0].dims,i=R.size(r),n=e[0].dataType,a=R.normalizeAxis(t.axis,r.length),s=new Array(t.numOutputs),o=D("input",n,r.length),l=new Array(t.numOutputs),d=[],h=[],c=0,f=[{type:12,data:i}];for(let _=0;_<t.numOutputs;_++){c+=t.splitSizes[_],l[_]=c;let w=r.slice();w[a]=t.splitSizes[_],h.push(w),s[_]=H(`output${_}`,n,w.length),d.push({dims:h[_],dataType:e[0].dataType})}f.push({type:12,data:l},...Q(r,...h));let y=_=>`
  ${_.registerUniform("input_size","u32").registerUniform("size_in_split_axis","u32",l.length).declareVariables(o,...s)}
  ${Rd(l.length)}
  ${Dd(s)}

  ${_.mainStart()}
    ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.input_size")}

    var indices = ${o.offsetToIndices("global_idx")};
    var index = ${o.indicesGet("indices",a)};
    let output_number = calculateOutputIndex(index);
    if (output_number != 0) {
      index -= ${Z("uniforms.size_in_split_axis","output_number - 1u",l.length)};
      ${o.indicesSet("indices",a,"index")};
    }
    writeBufferData(output_number, indices, global_idx);
  }`;return{name:"Split",shaderCache:{hint:t.cacheKey,inputDependencies:["rank"]},getShaderSource:y,getRunData:()=>({outputs:d,dispatchGroup:{x:Math.ceil(i/64)},programUniforms:f})}},Df=(e,t)=>{Od(e.inputs);let r=e.inputs.length===1?t:Ad(e.inputs,t);e.compute(_a(e.inputs,r),{inputs:[0]})},Mf=e=>{let t=e.axis,r=e.splitSizes,i=e.numOutputs<0?r.length:e.numOutputs;if(i!==r.length)throw new Error("numOutputs and splitSizes length must be equal");return fe({axis:t,numOutputs:i,splitSizes:r})}}),Md,gi,Nf,Pf=L(()=>{"use strict";te(),ne(),Ie(),ae(),Md=(e,t)=>{let[r,i,n,a]=e,{numHeads:s,rotaryEmbeddingDim:o}=t;if(r.dims.length!==3&&r.dims.length!==4)throw new Error(`Input 'x' is expected to have 3 or 4 dimensions, got ${r.dims.length}`);if(!R.areEqual(i.dims,[])&&!R.areEqual(i.dims,[1])&&i.dims.length!==2)throw new Error(`Input 'position_ids' is expected to have 0, 1, or 2 dimensions, got ${i.dims.length}`);if(n.dims.length!==2)throw new Error(`Input 'cos_cache' is expected to have 2 dimensions, got ${n.dims.length}`);if(a.dims.length!==2)throw new Error(`Input 'sin_cache' is expected to have 2 dimensions, got ${a.dims.length}`);if(!R.areEqual(n.dims,a.dims))throw new Error("Inputs 'cos_cache' and 'sin_cache' are expected to have the same shape");if(o>0&&s===0)throw new Error("num_heads must be provided if rotary_embedding_dim is specified");let l=r.dims[0],d=r.dims[r.dims.length-2],h=n.dims[0],c=R.sizeFromDimension(r.dims,1)/d,f=o===0?n.dims[1]*2:c/s;if(o>f)throw new Error("rotary_embedding_dim must be less than or equal to head_size");if(i.dims.length===2){if(l!==i.dims[0])throw new Error(`Input 'position_ids' dimension 0 should be of size batch_size, got ${i.dims[0]}`);if(d!==i.dims[1])throw new Error(`Input 'position_ids' dimension 1 should be of size sequence_length, got ${i.dims[1]}`)}if(d>h)throw new Error("Updating cos_cache and sin_cache in RotaryEmbedding is not currently supported");if(f/2!==n.dims[1]&&o/2!==n.dims[1])throw new Error(`Input 'cos_cache' dimension 1 should be same as head_size / 2 or rotary_embedding_dim / 2, got ${n.dims[1]}`)},gi=(e,t)=>{let{interleaved:r,numHeads:i,rotaryEmbeddingDim:n,scale:a}=t,s=e[0].dims[0],o=R.sizeFromDimension(e[0].dims,1),l=e[0].dims[e[0].dims.length-2],d=o/l,h=e[2].dims[1],c=n===0?h*2:d/i,f=new Array(s,l,d/c,c-h),y=R.computeStrides(f),_=[{type:1,data:a},{type:12,data:f},{type:12,data:y},...e[0].dims.length===3?new Array({type:12,data:[o,d,c,1]}):[],...e[0].dims.length===4?new Array({type:12,data:[o,c,l*c,1]}):[],...Q(e[0].dims,e[1].dims,e[2].dims,e[3].dims,e[0].dims)],w=S=>{let v=D("input",e[0].dataType,e[0].dims.length),b=D("position_ids",e[1].dataType,e[1].dims.length),T=D("cos_cache",e[2].dataType,e[2].dims.length),E=D("sin_cache",e[3].dataType,e[3].dims.length),I=H("output",e[0].dataType,e[0].dims.length);return S.registerUniforms([{name:"scale",type:"f32"},{name:"global_shape",type:"u32",length:f.length},{name:"global_strides",type:"u32",length:y.length},{name:"input_output_strides",type:"u32",length:y.length}]),`
        ${S.declareVariables(v,b,T,E,I)}

        ${S.mainStart(Jt)}
          let half_rotary_emb_dim = uniforms.${T.name}_shape[1];
          let bsnh = global_idx / uniforms.global_strides % uniforms.global_shape;
          let size = uniforms.global_shape[0] * uniforms.global_strides[0];
          ${S.guardAgainstOutOfBoundsWorkgroupSizes("size")}

          if (bsnh[3] < half_rotary_emb_dim) {
            let position_ids_idx =
                ${b.broadcastedIndicesToOffset("bsnh.xy",H("",b.type.tensor,2))};
            let position_id =
                u32(${b.getByOffset("position_ids_idx")}) + select(0, bsnh[1], position_ids_idx == 0);
            let i = dot(bsnh, uniforms.input_output_strides) + select(0, bsnh[3], ${r});
            let j = i + select(half_rotary_emb_dim, 1, ${r});
            let re = ${v.getByOffset("i")} * ${T.get("position_id","bsnh[3]")} -
                ${v.getByOffset("j")} * ${E.get("position_id","bsnh[3]")};
            ${I.setByOffset("i","re")}
            let im = ${v.getByOffset("i")} * ${E.get("position_id","bsnh[3]")} +
                ${v.getByOffset("j")} * ${T.get("position_id","bsnh[3]")};
            ${I.setByOffset("j","im")}
          } else {
            let k = dot(bsnh, uniforms.input_output_strides) + half_rotary_emb_dim;
            ${I.setByOffset("k",v.getByOffset("k"))}
          }
        }`};return{name:"RotaryEmbedding",shaderCache:{hint:fe({interleaved:r}).cacheKey,inputDependencies:["rank","rank","rank","rank"]},getShaderSource:w,getRunData:()=>({outputs:[{dims:e[0].dims,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(R.size(f)/Jt)},programUniforms:_})}},Nf=(e,t)=>{Md(e.inputs,t),e.compute(gi(e.inputs,t))}}),Bd,Nd,Wn,Pd,Lf,Fy=L(()=>{"use strict";Ie(),te(),Ma(),Rf(),Bf(),Et(),Pf(),ae(),Bd=(e,t)=>{if(t.doRotary&&e.length<=7)throw new Error("cos_cache and sin_cache inputs are required if do_rotary is specified");let r=e[0],i=e[1],n=e[2],a=e[3],s=e[4];if(t.doRotary!==0&&e.length<=7)throw new Error("cos_cast and sin_cache are expected if do_rotary attribute is non-zero");if(t.localWindowSize!==-1)throw new Error("Local attention is not supported");if(t.softcap!==0)throw new Error("Softcap is not supported");if(t.rotaryInterleaved!==0)throw new Error("Rotary interleaved is not supported");if(t.smoothSoftmax)throw new Error("Smooth softmax is not supported");if(r.dims.length!==3&&r.dims.length!==5)throw new Error("Input query is expected to have 3 or 5 dimensions");let o=!1,l=r.dims[0],d=r.dims[1],h=r.dims.length===3?o?r.dims[2]/3:r.dims[2]:t.numHeads*r.dims[4],c=d,f=0,y=!i||i.dims.length===0,_=Math.floor(y?h/(t.numHeads+2*t.kvNumHeads):h/t.numHeads);y&&(h=_*t.numHeads);let w=a&&a.dims.length!==0,S=s&&s.dims.length!==0;if(w&&a.dims.length===4&&a.dims[0]===l&&a.dims[1]!==t.kvNumHeads&&a.dims[2]===t.kvNumHeads&&a.dims[3]===_)throw new Error("BSNH pastKey/pastValue is not supported");if(w&&S){if(a.dims.length!==4)throw new Error('Input "past_key" is expected to have 4 dimensions');if(s.dims.length!==4)throw new Error('Input "past_value" is expected to have 4 dimensions');f=a.dims[2]}else if(w||S)throw new Error('Input "past_key" and "past_value" shall be both present or both absent');let v=1;if(i&&i.dims.length>0){if(r.dims.length!==3)throw new Error('Input "query" is expected to have 3 dimensions when key is given');if(i.dims.length<3||i.dims.length>5)throw new Error('Input "key" is expected to have 3, 4, or 5 dimensions');if(r.dims[0]!==i.dims[0])throw new Error('Input "query" and "key" shall have same dim 0 (batch size)');if(i.dims.length===3){if(r.dims[2]%i.dims[2]!==0)throw new Error('Dimension 2 of "query" should be a multiple of "key"');c=i.dims[1]}else if(i.dims.length===5){if(i.dims[2]!==t.numHeads||i.dims[3]!==2||i.dims[4]!==_)throw new Error('Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv');if(n)throw new Error('Expect "value" be none when "key" has packed kv format.');c=i.dims[1]}else{if(i.dims[1]!==t.numHeads||i.dims[3]!==_)throw new Error('Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key');c=i.dims[2]}}else{if(r.dims.length!==3&&r.dims.length!==5)throw new Error('Input "query" is expected to have 3 or 5 dimensions when key is empty');if(r.dims.length===5&&(r.dims[2]!==t.numHeads||r.dims[3]!==3))throw new Error('Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv');v=3}let b=0,T=!1,E=t.kvNumHeads?_*t.kvNumHeads:h;if(n&&n.dims.length>0){if(n.dims.length!==3&&n.dims.length!==4)throw new Error('Input "value" is expected to have 3 or 4 dimensions');if(r.dims[0]!==n.dims[0])throw new Error('Input "query" and "value" shall have same dim 0 (batch_size)');if(n.dims.length===3){if(c!==n.dims[1])throw new Error('Input "key" and "value" shall have the same dim 1 (kv_sequence_length)');E=n.dims[2]}else{if(c!==n.dims[2])throw new Error('Input "past_key" and "past_value" shall have the same dim 2 (kv_sequence_length)');E=n.dims[1]*n.dims[3],T=!0}}let I=e.length>4?e[5]:void 0;if(I){if(I.dims.length===0)throw new Error("seqlens_k must be at least 1D, got scalar.");let C=I.dims.reduce((z,$)=>z*$,1);if(C!==l)throw new Error(`seqlens_k must have batch_size (${l}) elements, got ${C}.`);for(let z=0;z<I.dims.length;z++)if(I.dims[z]!==1&&I.dims[z]!==l)throw new Error(`seqlens_k has unexpected shape. Each dimension must be 1 or batch_size (${l}), got dims[${z}] = ${I.dims[z]}.`)}return{batchSize:l,sequenceLength:d,pastSequenceLength:f,kvSequenceLength:c,totalSequenceLength:-1,maxSequenceLength:-1,inputHiddenSize:0,hiddenSize:h,vHiddenSize:E,headSize:_,vHeadSize:Math.floor(E/t.kvNumHeads),numHeads:t.numHeads,kvNumHeads:t.kvNumHeads,nReps:t.numHeads/t.kvNumHeads,pastPresentShareBuffer:!1,maskType:b,scale:t.scale,broadcastResPosBias:!1,passPastInKv:T,qkvFormat:v}},Nd=fe({perm:[0,2,1,3]}),Wn=(e,t,r)=>{let i=t,n=r.kvNumHeads;return t.dims.length===3&&r.kvSequenceLength!==0&&(i=t.reshape([r.batchSize,r.kvSequenceLength,n,r.headSize]),i=e.compute(Ue(i,Nd.perm),{inputs:[i],outputs:[-1]})[0]),i},Pd=(e,t,r,i)=>{let n=7,a=["type","type"],s=[e*t],o=e*t,l=[{type:12,data:o},{type:12,data:t},{type:12,data:e}],d=h=>{let c=D("seq_lens",r.dataType,r.dims),f=D("total_seq_lens",i.dataType,i.dims),y=H("pos_ids",n,s),_=[{name:"output_size",type:"u32"},{name:"sequence_length",type:"u32"},{name:"batch_size",type:"u32"}];return`
  ${h.registerUniforms(_).declareVariables(c,f,y)}
  ${h.mainStart()}
    ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let total_sequence_length = u32(${f.getByOffset("0")});
    let is_subsequent_prompt = uniforms.sequence_length > 1 && uniforms.sequence_length != total_sequence_length;
    let is_first_prompt = !is_subsequent_prompt && uniforms.sequence_length == total_sequence_length;
    let batch_idx = global_idx / uniforms.sequence_length;
    let sequence_idx = i32(global_idx % uniforms.sequence_length);
    var pos_id: i32 = 0;
    let seqlen = ${c.getByOffset("batch_idx")};
    let total_seqlen = seqlen + 1;
    if (is_first_prompt) {
      if (sequence_idx < total_seqlen) {
        pos_id = sequence_idx;
      } else {
        pos_id = 1;
      }
      ${y.setByOffset("global_idx","pos_id")}
    } else if (is_subsequent_prompt) {
      let past_seqlen = total_seqlen - i32(uniforms.sequence_length);
      if (past_seqlen + sequence_idx < total_seqlen) {
        pos_id = past_seqlen + sequence_idx;
      } else {
        pos_id = 1;
      }
      ${y.setByOffset("global_idx","pos_id")}
    } else if (global_idx < uniforms.batch_size) {
      ${y.setByOffset("global_idx","seqlen")}
    };
  }
  `};return{name:"GeneratePositionIds",shaderCache:{hint:`${e};${t}`,inputDependencies:a},getRunData:()=>({outputs:[{dims:s,dataType:n}],dispatchGroup:{x:Math.ceil(o/64)},programUniforms:l}),getShaderSource:d}},Lf=(e,t)=>{if(e.inputs.length>14&&e.inputs[14]||e.inputs.length>15&&e.inputs[15])throw new Error("GroupQueryAttention (JSEP): q_norm_weight / k_norm_weight inputs are not supported. The per-head Q/K RMS normalization prologue is implemented only on the CUDA and native WebGPU EPs.");let r=Bd(e.inputs,t);if(e.inputs[0].dims.length===5)throw new Error("Packed QKV is not implemented");if(e.inputs[1]?.dims.length===5)throw new Error("Packed KV is not implemented");let i=e.inputs[0],n=e.inputs[1]&&e.inputs[1].dims.length>0?e.inputs[1]:void 0,a=e.inputs[2]&&e.inputs[2].dims.length>0?e.inputs[2]:void 0,s=e.inputs[3]&&e.inputs[3].dims.length!==0?e.inputs[3]:void 0,o=e.inputs[4]&&e.inputs[4].dims.length!==0?e.inputs[4]:void 0,l=e.inputs.length>4?e.inputs[5]:void 0,d=e.inputs.length>5?e.inputs[6]:void 0,h=r.kvNumHeads?r.kvNumHeads:r.numHeads,c=fe({axis:2,numOutputs:3,splitSizes:[r.numHeads*r.headSize,h*r.headSize,h*r.headSize]}),[f,y,_]=!n&&!a?e.compute(_a([i],c),{inputs:[i],outputs:[-1,-1,-1]}):[i,n,a],w,S;if(t.doRotary){let E=e.compute(Pd(r.batchSize,r.sequenceLength,l,d),{inputs:[l,d],outputs:[-1]})[0],I=e.inputs[7],C=e.inputs[8],z=fe({interleaved:t.rotaryInterleaved!==0,numHeads:r.numHeads,rotaryEmbeddingDim:0,scale:t.scale}),$=[f,E,I,C],B=[-1];w=e.compute(gi($,z),{inputs:$,outputs:B})[0],$.splice(0,1,y);let W=fe({interleaved:t.rotaryInterleaved!==0,numHeads:r.kvNumHeads,rotaryEmbeddingDim:0,scale:t.scale});S=e.compute(gi($,W),{inputs:$,outputs:B})[0]}let v=Er(e,r.batchSize,r.numHeads,r.sequenceLength,r.headSize,t.doRotary?w:f,void 0,0),b=Wn(e,t.doRotary?S:y,r),T=Wn(e,_,r);zr(e,v,b,T,void 0,void 0,s,o,void 0,r,l,d)}}),qn,Ld,Ud,Uf,Hy=L(()=>{"use strict";te(),ne(),Et(),ae(),qn=(e,t,r,i,n,a,s,o)=>{let l=Ee(a),d=l===1?"f32":`vec${l}f`,h=l===1?"vec2f":`mat2x${l}f`,c=n*s,f=64;c===1&&(f=256);let y=[n,s,a/l],_=[n,s,2],w=["rank","type","type"],S=[];S.push(...Q(y,_));let v=b=>{let T=D("x",t.dataType,3,l),E=D("scale",r.dataType,r.dims),I=D("bias",i.dataType,i.dims),C=H("output",1,3,2),z=[T,E,I,C];return`
  var<workgroup> workgroup_shared : array<${h}, ${f}>;
  const workgroup_size = ${f}u;
  ${b.declareVariables(...z)}
  ${b.mainStart(f)}
    let batch = workgroup_index / uniforms.x_shape[1];
    let channel = workgroup_index % uniforms.x_shape[1];
    let hight = uniforms.x_shape[2];
    // initialize workgroup memory
    var sum = ${d}(0);
    var squared_sum = ${d}(0);
    for (var h = local_idx; h < hight; h += workgroup_size) {
      let value = ${d}(${T.get("batch","channel","h")});
      sum += value;
      squared_sum += value * value;
    }
    workgroup_shared[local_idx] = ${h}(sum, squared_sum);
    workgroupBarrier();

    for (var currSize = workgroup_size >> 1;  currSize > 0; currSize = currSize >> 1) {
      if (local_idx < currSize) {
        workgroup_shared[local_idx] = workgroup_shared[local_idx] + workgroup_shared[local_idx + currSize];
      }
      workgroupBarrier();
    }
    if (local_idx == 0) {
      let sum_final = ${Tt("workgroup_shared[0][0]",l)} / f32(hight * ${l});
      let squared_sum_final = ${Tt("workgroup_shared[0][1]",l)} / f32(hight * ${l});

      let inv_std_dev = inverseSqrt(squared_sum_final - sum_final * sum_final + f32(${o}));
      let channel_scale = inv_std_dev * f32(scale[channel]);
      let channel_shift = f32(bias[channel]) - sum_final * channel_scale;
      output[workgroup_index] = vec2f(channel_scale, channel_shift);
    }
  }`};return e.compute({name:"InstanceNormComputeChannelScaleShift",shaderCache:{hint:`${l};${o};${f}`,inputDependencies:w},getRunData:()=>({outputs:[{dims:_,dataType:1}],dispatchGroup:{x:c},programUniforms:S}),getShaderSource:v},{inputs:[t,r,i],outputs:[-1]})[0]},Ld=(e,t,r)=>{let i=t[0].dims,n=i,a=2,s=i[0],o=i[1],l=R.sizeFromDimension(i,a),d=Ee(l),h=R.size(n)/d,c=qn(e,t[0],t[1],t[2],s,l,o,r.epsilon),f=[s,o,l/d],y=[s,o],_=["type","none"],w=S=>{let v=D("x",t[0].dataType,f.length,d),b=D("scale_shift",1,y.length,2),T=H("output",t[0].dataType,f.length,d),E=[v,b,T];return`
  ${S.registerUniform("output_size","u32").declareVariables(...E)}
  ${S.mainStart()}
  ${S.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let outputIndices = ${T.offsetToIndices("global_idx")};
      let batch = outputIndices[0];
      let channel = outputIndices[1];
      let scale_shift = ${b.getByIndices("vec2<u32>(batch, channel)")};
      let value = ${v.getByOffset("global_idx")} * ${T.type.value}(scale_shift.x) + ${T.type.value}(scale_shift.y);
      ${T.setByOffset("global_idx","value")};
  }`};e.compute({name:"InstanceNormalization",shaderCache:{hint:`${d}`,inputDependencies:_},getRunData:()=>({outputs:[{dims:n,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(h/64)},programUniforms:[{type:12,data:h},...Q(f,y,f)]}),getShaderSource:w},{inputs:[t[0],c]})},Ud=(e,t,r)=>{let i=t[0].dims,n=i,a=i[0],s=i[i.length-1],o=R.sizeFromDimension(i,1)/s,l=Ee(s),d=R.size(n)/l,h=[{type:12,data:o},{type:12,data:Math.floor(s/l)}],c=["type","type"],f=!1,y=[0,i.length-1];for(let v=0;v<i.length-2;v++)f=f||i[v+1]!==1,y.push(v+1);f=f&&i[i.length-1]!==1;let _=f?e.compute(Ue(e.inputs[0],y),{inputs:[e.inputs[0]],outputs:[-1]})[0]:e.inputs[0].reshape(Array.from({length:i.length},(v,b)=>i[y[b]])),w=qn(e,_,t[1],t[2],a,o,s,r.epsilon),S=v=>{let b=ze(t[0].dataType),T=l===1?"vec2f":`mat${l}x2f`,E=z=>{let $=z===0?"x":"y",B=l===1?"f32":`vec${l}f`;switch(l){case 1:return`${b}(${B}(scale.${$}))`;case 2:return`vec2<${b}>(${B}(scale[0].${$}, scale[1].${$}))`;case 4:return`vec4<${b}>(${B}(scale[0].${$}, scale[1].${$}, scale[2].${$}, scale[3].${$}))`;default:throw new Error(`Not supported compoents ${l}`)}},I=D("input",t[0].dataType,t[0].dims,l),C=H("output",t[0].dataType,n,l);return`
  @group(0) @binding(0) var<storage, read> input : array<${I.type.storage}>;
  @group(0) @binding(1) var<storage, read> scale_input : array<${T}>;
  @group(0) @binding(2) var<storage, read_write> output : array<${C.type.storage}>;
  struct Uniforms {H: u32, C : u32};
  @group(0) @binding(3) var<uniform> uniforms: Uniforms;

  ${v.mainStart()}
    let current_image_number = global_idx / (uniforms.C * uniforms.H);
    let current_channel_number = global_idx % uniforms.C;

    let scale_offset = current_image_number * uniforms.C + current_channel_number;
    let scale = scale_input[scale_offset];
    output[global_idx] = fma(input[global_idx], ${E(0)}, ${E(1)});
  }`};e.compute({name:"InstanceNormalizationNHWC",shaderCache:{hint:`${l}`,inputDependencies:c},getRunData:()=>({outputs:[{dims:n,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(d/64)},programUniforms:h}),getShaderSource:S},{inputs:[t[0],w]})},Uf=(e,t)=>{t.format==="NHWC"?Ud(e,e.inputs,t):Ld(e,e.inputs,t)}}),Wd,qd,Wf,jy=L(()=>{"use strict";te(),ne(),ae(),Wd=e=>{if(!e||e.length<2)throw new Error("layerNorm requires at least 2 inputs.")},qd=(e,t,r)=>{let i=t.simplified,n=e[0].dims,a=e[1],s=!i&&e[2],o=n,l=R.normalizeAxis(t.axis,n.length),d=R.sizeToDimension(n,l),h=R.sizeFromDimension(n,l),c=R.size(a.dims),f=s?R.size(s.dims):0;if(c!==h||s&&f!==h)throw new Error(`Size of X.shape()[axis:] == ${h}.
       Size of scale and bias (if provided) must match this.
       Got scale size of ${c} and bias size of ${f}`);let y=[];for(let I=0;I<n.length;++I)I<l?y.push(n[I]):y.push(1);let _=Ee(h),w=["type","type"],S=[{type:12,data:d},{type:1,data:h},{type:12,data:Math.floor(h/_)},{type:1,data:t.epsilon}];s&&w.push("type");let v=r>1,b=r>2,T=I=>{let C=ze(e[0].dataType),z=[D("x",e[0].dataType,e[0].dims,_),D("scale",a.dataType,a.dims,_)];s&&z.push(D("bias",s.dataType,s.dims,_)),z.push(H("output",e[0].dataType,o,_)),v&&z.push(H("mean_data_output",1,y)),b&&z.push(H("inv_std_output",1,y));let $=[{name:"norm_count",type:"u32"},{name:"norm_size",type:"f32"},{name:"norm_size_vectorized",type:"u32"},{name:"epsilon",type:"f32"}];return`
  ${I.registerUniforms($).declareVariables(...z)}
  ${I.mainStart()}
    ${I.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.norm_count")}
    let offset = global_idx * uniforms.norm_size_vectorized;
    var mean_vector = ${ua("f32",_)};
    var mean_square_vector = ${ua("f32",_)};

    for (var h: u32 = 0u; h < uniforms.norm_size_vectorized; h++) {
      let value = ${Yt(C,_,"x[h + offset]")};
      mean_vector += value;
      mean_square_vector += value * value;
    }
    let mean = ${Tt("mean_vector",_)} / uniforms.norm_size;
    let inv_std_dev = inverseSqrt(${Tt("mean_square_vector",_)} / uniforms.norm_size ${i?"":"- mean * mean"} + uniforms.epsilon);

    for (var j: u32 = 0; j < uniforms.norm_size_vectorized; j++) {
      let f32input = ${Yt(C,_,"x[j + offset]")};
      let f32scale = ${Yt(C,_,"scale[j]")};
      output[j + offset] = ${z[0].type.value}((f32input ${i?"":"- mean"}) * inv_std_dev * f32scale
        ${s?`+ ${Yt(C,_,"bias[j]")}`:""}
      );
    }

    ${v?"mean_data_output[global_idx] = mean":""};
    ${b?"inv_std_output[global_idx] = inv_std_dev":""};
  }`},E=[{dims:o,dataType:e[0].dataType}];return v&&E.push({dims:y,dataType:1}),b&&E.push({dims:y,dataType:1}),{name:"LayerNormalization",shaderCache:{hint:`${_};${r};${i}`,inputDependencies:w},getRunData:()=>({outputs:E,dispatchGroup:{x:Math.ceil(d/64)},programUniforms:S}),getShaderSource:T}},Wf=(e,t)=>{Wd(e.inputs),e.compute(qd(e.inputs,t,e.outputCount))}}),Vd,qf,Ky=L(()=>{"use strict";ne(),Ua(),Wa(),Vd=e=>{if(!e||e.length!==2)throw new Error("MatMul requires 2 inputs.");if(e[0].dims[e[0].dims.length-1]!==e[1].dims[e[1].dims.length-2])throw new Error("shared dimension does not match.")},qf=e=>{Vd(e.inputs);let t=Qt.calcShape(e.inputs[0].dims,e.inputs[1].dims,!0);if(!t)throw new Error("Can't use matmul on the given tensors");let r=t[t.length-1],i=e.inputs[0].dims[e.inputs[0].dims.length-1];if(r<8&&i<8)e.compute(La(e.inputs,{activation:""},t));else{let n=t[t.length-2],a=R.size(e.inputs[0].dims.slice(0,-2)),s=R.size(e.inputs[1].dims.slice(0,-2));if(a!==1&&n===1&&s===1){let o=e.inputs[0].reshape([1,a,i]),l=e.inputs[1].reshape([1,i,r]),d=[1,a,r],h=[o,l];e.compute(mi(h,{activation:""},t,d),{inputs:h})}else e.compute(mi(e.inputs,{activation:""},t))}}}),Gd,Fd,Hd,Vf,Gf,Xy=L(()=>{"use strict";te(),ne(),Ie(),ae(),Gd=(e,t)=>{if(e.length<3||e.length>4)throw new Error("MatMulNBits requires 3 or 4 inputs");let r=e[0],i=r.dims.length;if(r.dims[i-1]!==t.k)throw new Error("The last dim of input shape does not match the k value");let n=Math.floor((t.k+t.blockSize-1)/t.blockSize),a=t.blockSize/8*t.bits,s=e[1];if(!R.areEqual(s.dims,[t.n,n,a]))throw new Error("The second inputs must be 3D tensor with shape N X nBlocksPerCol X blobSize");let o=e[2].dims;if(R.size(o)!==t.n*n)throw new Error("scales input size error.");if(e.length===4){let l=e[3].dims,d=t.n*(t.bits===8?n:Math.floor((n*t.bits+7)/8));if(R.size(l)!==d)throw new Error("zeroPoints input size error.")}},Fd=(e,t)=>{let r=e[0].dims,i=r.length,n=r[i-2],a=t.k,s=t.n,o=r.slice(0,i-2),l=R.size(o),d=e[1].dims[2]/4,h=e[0].dataType,c=Ee(t.k),f=Ee(d),y=Ee(s),_=o.concat([n,s]),w=n>1&&s/y%2===0?2:1,S=R.size(_)/y/w,v=64,b=[],T=[l,n,a/c],E=R.convertShape(e[1].dims).slice();E.splice(-1,1,d/f),b.push(...Q(T)),b.push(...Q(E)),b.push(...Q(e[2].dims)),e.length===4&&b.push(...Q(R.convertShape(e[3].dims)));let I=[l,n,s/y];b.push(...Q(I));let C=z=>{let $=T.length,B=D("a",e[0].dataType,$,c),W=D("b",12,E.length,f),F=D("scales",e[2].dataType,e[2].dims.length),q=[B,W,F],P=e.length===4?D("zero_points",12,e[3].dims.length):void 0;P&&q.push(P);let K=I.length,O=H("output",e[0].dataType,K,y),U=ze(e[0].dataType),J=(()=>{switch(c){case 1:return`array<${U}, 8>`;case 2:return`mat4x2<${U}>`;case 4:return`mat2x4<${U}>`;default:throw new Error(`${c}-component is not supported.`)}})(),re=Math.floor(32/t.bits),X=Math.floor(re/8),se=()=>{let Y="";for(let j=0;j<X;j++){let ve=j*t.bits*4,De=ve+t.bits;Y+=`
          // reuse a data (pass ${j})
            var input_offset${j>0?j:""} = ${j===0?B.indicesToOffset(`${B.type.indices}(batch, row, word_offset)`):"input_offset"};
            var a_data${j>0?j:""}: ${J};
            for (var j${j>0?j:""}: u32 = 0; j${j>0?j:""} < ${8/c}; j${j>0?j:""}++) {
              a_data${j>0?j:""}[j${j>0?j:""}] = ${B.getByOffset(`input_offset${j>0?j:""}`)};
              input_offset${j>0?j:""}++;
            }
          `;for(let Se=0;Se<y*w;Se++)Y+=`
            b_value = ${f===1?`b${Se}_data`:`b${Se}_data[i]`};
            ${t.bits===2?`{
              let half_word = b_value >> ${j*16}u;
              let byte_lo = half_word & 0xFFu;
              let byte_hi = (half_word >> 8u) & 0xFFu;
              let spread_word = (byte_lo & 0xFu) | ((byte_lo >> 4u) << 8u) | ((byte_hi & 0xFu) << 16u) | ((byte_hi >> 4u) << 24u);
              b_value_lower = unpack4xU8(spread_word & b_mask);
              b_value_upper = unpack4xU8((spread_word >> 2u) & b_mask);
            }`:`b_value_lower = unpack4xU8((b_value >> ${ve}u) & b_mask);
            b_value_upper = unpack4xU8((b_value >> ${De}u) & b_mask);`}
            b_quantized_values = ${J}(${Array.from({length:4},(Oe,_e)=>`${U}(b_value_lower[${_e}]), ${U}(b_value_upper[${_e}])`).join(", ")});
            b_dequantized_values = ${c===1?`${J}(${Array.from({length:8},(Oe,_e)=>`(b_quantized_values[${_e}] - ${P?`zero_point${Se}`:"zero_point"}) * scale${Se}`).join(", ")});`:`(b_quantized_values - ${J}(${Array(8).fill(`${P?`zero_point${Se}`:"zero_point"}`).join(",")})) * scale${Se};`};
            workgroup_shared[local_id.x * ${w} + ${Math.floor(Se/y)}]${y>1?`[${Se%y}]`:""} += ${Array.from({length:8/c},(Oe,_e)=>`${c===1?`a_data${j>0?j:""}[${_e}] * b_dequantized_values[${_e}]`:`dot(a_data${j>0?j:""}[${_e}], b_dequantized_values[${_e}])`}`).join(" + ")};
          `}return Y},N=()=>{let Y=`
            var col_index = col * ${y};
            ${P?`
            let zero_point_values_per_byte: u32 = ${Math.floor(8/t.bits)}u;
            let zero_point_bytes_per_col = (nBlocksPerCol + zero_point_values_per_byte - 1u) / zero_point_values_per_byte;
            var zero_point_byte_count: u32;
            var zero_point_word_index: u32;
            var zero_point_byte_offset: u32;
            let zero_point_sub_offset: u32 = block % zero_point_values_per_byte;
            var zero_point_bits_offset: u32;
            var zero_point_word: u32;`:`
            // The default zero point is ${Math.pow(2,t.bits-1)} for unsigned ${t.bits}-bit quantization.
            let zero_point = ${U}(${Math.pow(2,t.bits-1).toFixed(1)});`}
            `;for(let j=0;j<y*w;j++)Y+=`
            let scale${j} = ${F.getByOffset("col_index * nBlocksPerCol + block")};
            ${P?`
            zero_point_byte_count = col_index * zero_point_bytes_per_col + (block / zero_point_values_per_byte);
            zero_point_word_index = zero_point_byte_count >> 0x2u;
            zero_point_byte_offset = zero_point_byte_count & 0x3u;
            zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_sub_offset * ${t.bits}u);
            zero_point_word = ${P.getByOffset("zero_point_word_index")} >> zero_point_bits_offset;
            let zero_point${j} = ${U}((zero_point_word) & ${t.bits===2?"0x3u":"0xFu"});`:""}
            col_index += 1;`;return Y},ee=()=>{let Y=`col_index = col * ${y};`;for(let j=0;j<y*w;j++)Y+=`
            let b${j}_data = ${W.getByIndices(`${W.type.indices}(col_index, block, word)`)};
            col_index += 1;`;return Y+=`
            var b_value: u32;
            let b_mask: u32 = ${t.bits===2?"0x03030303u":"0x0F0F0F0Fu"};
            var b_value_lower: vec4<u32>;
            var b_value_upper: vec4<u32>;
            var b_quantized_values: ${J};
            var b_dequantized_values: ${J};`,Y};return`
        var<workgroup> workgroup_shared: array<${O.type.value}, ${w*v}>;
        ${z.declareVariables(...q,O)}
        ${z.mainStart([v,1,1])}
          let output_indices = ${O.offsetToIndices(`(global_idx / ${v}) * ${w}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let nBlocksPerCol = uniforms.b_shape[1];

          for (var block = local_id.x; block < nBlocksPerCol; block += ${v}) {
            //process one block
            var word_offset: u32 = block * ${t.blockSize/c};
            ${N()}
            for (var word: u32 = 0; word < ${d}; word += ${f}) {
              ${ee()}
              for (var i: u32 = 0; i < ${f}; i++) {
                ${se()}
                word_offset += ${re/c};
              }
            }
          }
          workgroupBarrier();

          if (local_id.x < ${w}) {
            var output_value: ${O.type.value} = ${O.type.value}(0);
            var workgroup_shared_offset: u32 = local_id.x;
            for (var b: u32 = 0u; b < ${v}u; b++) {
              output_value += workgroup_shared[workgroup_shared_offset];
              workgroup_shared_offset += ${w};
            }
            ${O.setByIndices(`${O.type.indices}(batch, row, col + local_id.x)`,"output_value")};
          }
        }`};return{name:"MatMulNBits",shaderCache:{hint:`${t.blockSize};${t.bits};${c};${f};${y};${w};${v}`,inputDependencies:Array(e.length).fill("rank")},getRunData:()=>({outputs:[{dims:_,dataType:h}],dispatchGroup:{x:S},programUniforms:b}),getShaderSource:C}},Hd=(e,t)=>{let r=e[0].dims,i=r.length,n=r[i-2],a=t.k,s=t.n,o=r.slice(0,i-2),l=R.size(o),d=e[1].dims[2]/4,h=e[0].dataType,c=Ee(t.k),f=Ee(d),y=o.concat([n,s]),_=128,w=s%8===0?8:s%4===0?4:1,S=_/w,v=Math.floor(32/t.bits),b=S*f*v,T=b/c,E=b/t.blockSize,I=R.size(y)/w,C=[],z=[l,n,a/c],$=R.convertShape(e[1].dims).slice();$.splice(-1,1,d/f),C.push(...Q(z)),C.push(...Q($)),C.push(...Q(e[2].dims)),e.length===4&&C.push(...Q(R.convertShape(e[3].dims)));let B=[l,n,s];C.push(...Q(B));let W=F=>{let q=z.length,P=D("a",e[0].dataType,q,c),K=D("b",12,$.length,f),O=D("scales",e[2].dataType,e[2].dims.length),U=[P,K,O],J=e.length===4?D("zero_points",12,e[3].dims.length):void 0;J&&U.push(J);let re=B.length,X=H("output",e[0].dataType,re),se=ze(e[0].dataType),N=()=>{switch(c){case 1:return`
          let a_data0 = vec4<${se}>(sub_a[word_offset], sub_a[word_offset + 1], sub_a[word_offset + 2], sub_a[word_offset + 3]);
          let a_data1 = vec4<${se}>(sub_a[word_offset + 4], sub_a[word_offset + 5], sub_a[word_offset + 6], sub_a[word_offset + 7]);`;case 2:return`
          let a_data0 = vec4<${se}>(sub_a[word_offset], sub_a[word_offset + 1]);
          let a_data1 = vec4<${se}>(sub_a[word_offset + 2], sub_a[word_offset + 3]);`;case 4:return`
          let a_data0 = sub_a[word_offset];
          let a_data1 = sub_a[word_offset + 1];`;default:throw new Error(`${c}-component is not supported.`)}};return`
        var<workgroup> sub_a: array<${P.type.value}, ${T}>;
        var<workgroup> inter_results: array<array<${X.type.value}, ${S}>, ${w}>;
        ${F.declareVariables(...U,X)}
        ${F.mainStart([S,w,1])}
          let output_indices = ${X.offsetToIndices(`workgroup_index * ${w}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let n_blocks_per_col = uniforms.b_shape[1];
          let num_tiles =  (n_blocks_per_col - 1) / ${E} + 1;

          // Loop over shared dimension.
          for (var tile: u32 = 0; tile < num_tiles; tile += 1) {
            let a_col_start = tile * ${T};
            // load one tile A data into shared memory.
            for (var a_offset = local_idx; a_offset < ${T}; a_offset += ${_})
            {
              let a_col = a_col_start + a_offset;
              if (a_col < uniforms.a_shape[2])
              {
                sub_a[a_offset] = ${P.getByIndices(`${P.type.indices}(batch, row, a_col)`)};
              } else {
                sub_a[a_offset] = ${P.type.value}(0);
              }
            }
            workgroupBarrier();

            // each thread process one block
            let b_row = col + local_id.y;
            let block = tile * ${E} + local_id.x;
            ${J?`
            let zero_point_values_per_byte: u32 = ${Math.floor(8/t.bits)}u;
            let zero_point_bytes_per_col = (n_blocks_per_col + zero_point_values_per_byte - 1u) / zero_point_values_per_byte;
            let zero_point_byte_count = b_row * zero_point_bytes_per_col + (block / zero_point_values_per_byte);
            let zero_point_word_index = zero_point_byte_count >> 0x2u;
            let zero_point_byte_offset = zero_point_byte_count & 0x3u;
            let zero_point_sub_offset: u32 = block % zero_point_values_per_byte;
            let zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_sub_offset * ${t.bits}u);
            let zero_point_word = ${J.getByOffset("zero_point_word_index")} >> zero_point_bits_offset;
            let zero_point = ${se}((zero_point_word) & ${t.bits===2?"0x3u":"0xFu"});`:`
            // The default zero point is ${Math.pow(2,t.bits-1)} for unsigned ${t.bits}-bit quantization.
            let zero_point = ${se}(${Math.pow(2,t.bits-1).toFixed(1)});`}
            let scale = ${O.getByOffset("b_row * n_blocks_per_col + block")};
            let b_data = ${K.getByIndices(`${K.type.indices}(b_row, block, 0)`)};
            var word_offset = local_id.x * ${t.blockSize/c};
            for (var i: u32 = 0; i < ${f}; i++) {
              let b_value = ${f===1?"b_data":"b_data[i]"};
              ${(()=>{let ee=Math.floor(v/8),Y="";for(let j=0;j<ee;j++){let ve=j*t.bits*4,De=ve+t.bits;Y+=`
              ${N()}
              {${t.bits===2?`
                let half_word = b_value >> ${j*16}u;
                let byte_lo = half_word & 0xFFu;
                let byte_hi = (half_word >> 8u) & 0xFFu;
                let spread_word = (byte_lo & 0xFu) | ((byte_lo >> 4u) << 8u) | ((byte_hi & 0xFu) << 16u) | ((byte_hi >> 4u) << 24u);
                let b_value_lower = unpack4xU8(spread_word & 0x03030303u);
                let b_value_upper = unpack4xU8((spread_word >> 2u) & 0x03030303u);`:`
                let b_value_lower = unpack4xU8((b_value >> ${ve}u) & 0x0F0F0F0Fu);
                let b_value_upper = unpack4xU8((b_value >> ${De}u) & 0x0F0F0F0Fu);`}
                let b_quantized_values = mat2x4<${se}>(${Array.from({length:4},(Se,Oe)=>`${se}(b_value_lower[${Oe}]), ${se}(b_value_upper[${Oe}])`).join(", ")});
                let b_dequantized_values = (b_quantized_values - mat2x4<${se}>(${Array(8).fill("zero_point").join(",")})) * scale;
                inter_results[local_id.y][local_id.x] += ${Array.from({length:2},(Se,Oe)=>`${`dot(a_data${Oe}, b_dequantized_values[${Oe}])`}`).join(" + ")};
              }
              word_offset += ${8/c};`}return Y})()}
            }
            workgroupBarrier();
          }

          if (local_idx < ${w}) {
            var output_value: ${X.type.value} = ${X.type.value}(0);
            for (var b = 0u; b < ${S}; b++) {
              output_value += inter_results[local_idx][b];
            }
            if (col + local_idx < uniforms.output_shape[2])
            {
              ${X.setByIndices(`${X.type.indices}(batch, row, col + local_idx)`,"output_value")}
            }
          }
        }`};return{name:"BlockwiseMatMulNBits32",shaderCache:{hint:`${t.blockSize};${c};${f};${S};${w}`,inputDependencies:Array(e.length).fill("rank")},getRunData:()=>({outputs:[{dims:y,dataType:h}],dispatchGroup:{x:I},programUniforms:C}),getShaderSource:W}},Vf=(e,t)=>{Gd(e.inputs,t),t.blockSize===32&&e.adapterInfo.isVendor("intel")&&e.adapterInfo.isArchitecture("gen-12lp")?e.compute(Hd(e.inputs,t)):e.compute(Fd(e.inputs,t))},Gf=e=>fe(e)}),jd,Kd,Xd,Zd,Yd,Qd,Jd,ep,Ff,Zy=L(()=>{"use strict";te(),ne(),ae(),jd=e=>{if(!e||e.length<1)throw new Error("Too few inputs");if(e[0].dataType!==1&&e[0].dataType!==10)throw new Error("Input type must be float or float16.");if(e.length>=2){let t=e[0].dims.length*2===e[1].dims[0];if(e.length===4&&(t=e[3].dims[0]*2===e[1].dims[0]),!t)throw new Error("The pads should be a 1D tensor of shape [2 * input_rank] or [2 * num_axes].")}},Kd=(e,t,r)=>{let i="";for(let n=t-1;n>=0;--n)i+=`
            k = i32(${e.indicesGet("indices",n)}) - ${Z("uniforms.pads",n,r)};
            if (k < 0) {
              break;
            }
            if (k >= i32(${Z("uniforms.x_shape",n,t)})) {
              break;
            }
            offset += k * i32(${Z("uniforms.x_strides",n,t)});
        `;return`
          value = ${e.type.value}(uniforms.constant_value);
          for (var i = 0; i < 1; i++) {
            var offset = 0;
            var k = 0;
            ${i}
            value = x[offset];
          }
      `},Xd=(e,t,r)=>{let i="";for(let n=t-1;n>=0;--n)i+=`
                k = i32(${e.indicesGet("indices",n)}) - ${Z("uniforms.pads",n,r)};
                if (k < 0) {
                  k = -k;
                }
                {
                  let _2n_1 = 2 * (i32(${Z("uniforms.x_shape",n,t)}) - 1);
                  k = k % _2n_1;
                  if(k >= i32(${Z("uniforms.x_shape",n,t)})) {
                    k = _2n_1 - k;
                  }
                }
                offset += k * i32(${Z("uniforms.x_strides",n,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${i}
              value = x[offset];
          `},Zd=(e,t,r)=>{let i="";for(let n=t-1;n>=0;--n)i+=`
                k = i32(${e.indicesGet("indices",n)}) - ${Z("uniforms.pads",n,r)};
                if (k < 0) {
                  k = 0;
                }
                if (k >= i32(${Z("uniforms.x_shape",n,t)})) {
                  k = i32(${Z("uniforms.x_shape",n,t)}) - 1;
                }
                offset += k * i32(${Z("uniforms.x_strides",n,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${i}
              value = x[offset];
          `},Yd=(e,t,r)=>{let i="";for(let n=t-1;n>=0;--n)i+=`
                k = i32(${e.indicesGet("indices",n)}) - ${Z("uniforms.pads",n,r)};
                if (k < 0)  {
                  k += i32(${Z("uniforms.x_shape",n,t)}]);
                }
                if (k >= i32(${Z("uniforms.x_shape",n,t)})) {
                  k -= i32(${Z("uniforms.x_shape",n,t)});
                }
                offset += k * i32(${Z("uniforms.x_strides",n,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${i}
              value = x[offset];
          `},Qd=(e,t,r)=>{switch(r.mode){case 0:return Kd(e,t,r.pads.length);case 1:return Xd(e,t,r.pads.length);case 2:return Zd(e,t,r.pads.length);case 3:return Yd(e,t,r.pads.length);default:throw new Error("Invalid mode")}},Jd=(e,t)=>{let r=R.padShape(e[0].dims.slice(),t.pads),i=e[0].dims,n=R.size(r),a=[{type:12,data:n},{type:6,data:t.pads}],s=e.length>=3&&e[2].data;t.mode===0&&a.push({type:s?e[2].dataType:1,data:t.value}),a.push(...Q(e[0].dims,r));let o=["rank"],l=d=>{let h=H("output",e[0].dataType,r.length),c=D("x",e[0].dataType,i.length),f=c.type.value,y=Qd(h,i.length,t),_=[{name:"output_size",type:"u32"},{name:"pads",type:"i32",length:t.pads.length}];return t.mode===0&&_.push({name:"constant_value",type:s?f:"f32"}),`
            ${d.registerUniforms(_).declareVariables(c,h)}
            ${d.mainStart()}
            ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

            let indices = ${h.offsetToIndices("global_idx")};

            var value = ${f}(0);
            ${y}
            output[global_idx] = value;
        }`};return{name:"Pad",shaderCache:{hint:`${t.mode}${s}`,inputDependencies:o},getRunData:()=>({outputs:[{dims:r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(R.size(r)/64)},programUniforms:a}),getShaderSource:l}},ep=(e,t)=>{if(e.length>1){let r=e[1].getBigInt64Array(),i=e.length>=3&&e[2].data?e[2].dataType===10?e[2].getUint16Array()[0]:e[2].getFloat32Array()[0]:0,n=e[0].dims.length,a=new Int32Array(2*n).fill(0);if(e.length>=4){let o=e[3].getBigInt64Array();for(let l=0;l<o.length;l++)a[Number(o[l])]=Number(r[l]),a[Number(o[l])+n]=Number(r[l+o.length])}else r.forEach((o,l)=>a[Number(l)]=Number(o));let s=[];return a.forEach(o=>s.push(o)),{mode:t.mode,value:i,pads:s}}else return t},Ff=(e,t)=>{jd(e.inputs);let r=ep(e.inputs,t);e.compute(Jd(e.inputs,r),{inputs:[0]})}}),wr,Vn,Gn,Fn,Hn,tp,rp,jn,Kn,Hf,jf,Xn,Kf,Xf,Zn,Zf,Yf,Qf,Jf,Yy=L(()=>{"use strict";Ge(),te(),ne(),ae(),wr=e=>{if(ge.webgpu.validateInputContent&&(!e||e.length!==1))throw new Error("Pool ops requires 1 input.")},Vn=(e,t,r)=>{let i=t.format==="NHWC",n=e.dims.slice();i&&n.splice(1,0,n.pop());let a=Object.hasOwnProperty.call(t,"dilations"),s=t.kernelShape.slice(),o=t.strides.slice(),l=a?t.dilations.slice():[],d=t.pads.slice();hi.adjustPoolAttributes(r,n,s,o,l,d);let h=hi.computePoolOutputShape(r,n,o,l,s,d,t.autoPad,t.ceilMode),c=Object.assign({},t);a?Object.assign(c,{kernelShape:s,strides:o,pads:d,dilations:l,cacheKey:t.cacheKey}):Object.assign(c,{kernelShape:s,strides:o,pads:d,cacheKey:t.cacheKey});let f=h.slice();return f.push(f.splice(1,1)[0]),[c,i?f:h]},Gn=(e,t)=>{let r=t.format==="NHWC",i=R.size(e),n=R.size(t.kernelShape),a=[{type:12,data:i},{type:12,data:n}],s=[{name:"outputSize",type:"u32"},{name:"kernelSize",type:"u32"}];if(t.kernelShape.length<=2){let o=t.kernelShape[t.kernelShape.length-1],l=t.strides[t.strides.length-1],d=t.pads[t.pads.length/2-1],h=t.pads[t.pads.length-1],c=!!(d+h);a.push({type:12,data:o},{type:12,data:l},{type:12,data:d},{type:12,data:h}),s.push({name:"kw",type:"u32"},{name:"sw",type:"u32"},{name:"pwStart",type:"u32"},{name:"pwEnd",type:"u32"});let f=!1;if(t.kernelShape.length===2){let y=t.kernelShape[t.kernelShape.length-2],_=t.strides[t.strides.length-2],w=t.pads[t.pads.length/2-2],S=t.pads[t.pads.length-2];f=!!(w+S),a.push({type:12,data:y},{type:12,data:_},{type:12,data:w},{type:12,data:S}),s.push({name:"kh",type:"u32"},{name:"sh",type:"u32"},{name:"phStart",type:"u32"},{name:"phEnd",type:"u32"})}return[a,s,!0,c,f]}else{if(r)throw new Error("Pooling with kernelShape.length > 2 is not supported for NHWC format.");let o=R.computeStrides(t.kernelShape);a.push({type:12,data:o},{type:12,data:t.pads},{type:12,data:t.strides}),s.push({name:"kernelStrides",type:"u32",length:o.length},{name:"pads",type:"u32",length:t.pads.length},{name:"strides",type:"u32",length:t.strides.length});let l=t.pads.reduce((d,h)=>d+h);return[a,s,!!l,!1,!1]}},Fn=(e,t,r,i,n,a,s,o,l,d,h,c)=>{let f=n.format==="NHWC",y=t.type.value,_=H("output",t.type.tensor,i);if(n.kernelShape.length<=2){let w="",S="",v="",b=r-(f?2:1);if(h?w=`
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${b}] = indices[${b}] * uniforms.sw - uniforms.pwStart + i;
                  if (xIndices[${b}] < 0 || xIndices[${b}]
                      >= uniforms.x_shape[${b}]) {
                    pad++;
                    continue;
                  }
                  let x_val = x[${t.indicesToOffset("xIndices")}];
                  ${a}
                }`:w=`
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${b}] = indices[${b}] * uniforms.sw - uniforms.pwStart + i;
                  let x_val = x[${t.indicesToOffset("xIndices")}];
                  ${a}
                }`,n.kernelShape.length===2){let T=r-(f?3:2);c?S=`
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${T}] = indices[${T}] * uniforms.sh - uniforms.phStart + j;
                  if (xIndices[${T}] < 0 || xIndices[${T}] >= uniforms.x_shape[${T}]) {
                    pad += i32(uniforms.kw);
                    continue;
                  }
              `:S=`
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${T}] = indices[${T}] * uniforms.sh - uniforms.phStart + j;
                `,v=`
              }
            `}return`
            ${e.registerUniforms(l).declareVariables(t,_)}

            ${e.mainStart()}
              ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

              let indices = ${_.offsetToIndices("global_idx")};
              var xIndices = ${_.offsetToIndices("global_idx")};

              var value = ${y}(${o});
              var pad = 0;
              ${S}
              ${w}
              ${v}
              ${s}

              output[global_idx] = value;
            }`}else{if(f)throw new Error("Pooling with kernelShape.length > 2 is not supported for NHWC format.");let w=n.kernelShape.length,S=n.pads.length,v="";return d?v=`
                if (xIndices[j] >= uniforms.x_shape[j]) {
                  pad++;
                  isPad = true;
                  break;
                }
              }
              if (!isPad) {
                let x_val = x[${t.indicesToOffset("xIndices")}];
                ${a}
              }`:v=`
              }
              let x_val = x[${t.indicesToOffset("xIndices")}];
              ${a}
            `,`
            ${e.registerUniforms(l).declareVariables(t,_)}

            ${e.mainStart()}
              ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
              let indices = ${_.offsetToIndices("global_idx")};
              var xIndices = ${_.offsetToIndices("global_idx")};

              var offsets: array<u32, ${w}>;

              var value = ${y}(${o});
              var pad = 0;
              var isPad = false;

              for (var i: u32 = 0u; i < uniforms.kernelSize; i++) {
                var offset = i;
                for (var j = 0u; j < ${w-1}u; j++) {
                  offsets[j] = offset / ${Z("uniforms.kernelStrides","j",w)};
                  offset -= offsets[j] * ${Z("uniforms.kernelStrides","j",w)};
                }
                offsets[${w-1}] = offset;

                isPad = false;
                for (var j = ${r-w}u; j < ${r}u; j++) {
                  xIndices[j] = indices[j] * ${Z("uniforms.strides",`j - ${r-w}u`,w)}
                    + offsets[j - ${r-w}u] - ${Z("uniforms.pads","j - 2u",S)};
                  ${v}
              }
              ${s}

              output[global_idx] = value;
            }`}},Hn=e=>`${e.format};${e.ceilMode};${e.autoPad};${e.kernelShape.length}`,tp=e=>`${Hn(e)};${e.countIncludePad}`,rp=e=>`${Hn(e)};${e.storageOrder};${e.dilations}`,jn=e=>({format:e.format,autoPad:["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][e.auto_pad],ceilMode:e.ceil_mode,kernelShape:e.kernel_shape,strides:e.strides,pads:e.pads}),Kn=(e,t,r,i)=>{let[n,a]=Vn(t,i,r),s=D("x",t.dataType,t.dims.length),o=s.type.value,l="value += x_val;",d="";n.countIncludePad?d+=`value /= ${o}(uniforms.kernelSize);`:d+=`value /= ${o}(i32(uniforms.kernelSize) - pad);`;let[h,c,f,y,_]=Gn(a,n);h.push(...Q(t.dims,a));let w=["rank"];return{name:e,shaderCache:{hint:`${i.cacheKey};${f};${y};${_}`,inputDependencies:w},getRunData:()=>({outputs:[{dims:a,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(R.size(a)/64)},programUniforms:h}),getShaderSource:S=>Fn(S,s,t.dims.length,a.length,n,l,d,0,c,f,y,_)}},Hf=e=>{let t=e.count_include_pad!==0,r=jn(e);if(r.ceilMode!==0)throw new Error("ceil_mode output-shape is computed, but ceil_mode kernel execution (padding/divisor) is not yet implemented in the WebGPU AveragePool kernel");let i={countIncludePad:t,...r,cacheKey:""};return{...i,cacheKey:tp(i)}},jf=(e,t)=>{wr(e.inputs),e.compute(Kn("AveragePool",e.inputs[0],!1,t))},Xn={autoPad:"",ceilMode:0,countIncludePad:!1,kernelShape:[],strides:[],pads:[],storageOrder:0,dilations:[]},Kf=e=>{let t=e.format;return{format:t,...Xn,cacheKey:t}},Xf=(e,t)=>{wr(e.inputs),e.compute(Kn("GlobalAveragePool",e.inputs[0],!0,t))},Zn=(e,t,r,i)=>{let[n,a]=Vn(t,i,r),s=`
      value = max(x_val, value);
    `,o="",l=D("x",t.dataType,t.dims.length),d=["rank"],[h,c,f,y,_]=Gn(a,n);return h.push(...Q(t.dims,a)),{name:e,shaderCache:{hint:`${i.cacheKey};${f};${y};${_}`,inputDependencies:d},getRunData:()=>({outputs:[{dims:a,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(R.size(a)/64)},programUniforms:h}),getShaderSource:w=>Fn(w,l,t.dims.length,a.length,n,s,o,t.dataType===10?-65504:-1e5,c,f,y,_)}},Zf=(e,t)=>{wr(e.inputs),e.compute(Zn("MaxPool",e.inputs[0],!1,t))},Yf=e=>{let t=e.storage_order,r=e.dilations,i=jn(e);if(t!==0)throw new Error("column major storage order is not yet supported for MaxPool");if(i.ceilMode!==0)throw new Error("ceil_mode output-shape is computed, but ceil_mode kernel execution (padding) is not yet implemented in the WebGPU MaxPool kernel");let n={storageOrder:t,dilations:r,...i,cacheKey:""};return{...n,cacheKey:rp(n)}},Qf=e=>{let t=e.format;return{format:t,...Xn,cacheKey:t}},Jf=(e,t)=>{wr(e.inputs),e.compute(Zn("GlobalMaxPool",e.inputs[0],!0,t))}}),ip,np,em,tm,Qy=L(()=>{"use strict";te(),ne(),Ie(),ae(),ip=(e,t)=>{if(e.length<2||e.length>3)throw new Error("DequantizeLinear requires 2 or 3 inputs.");if(e.length===3&&e[1].dims===e[2].dims)throw new Error("x-scale and x-zero-point must have the same shape.");if(e.length===3&&e[0].dataType!==e[2].dataType)throw new Error("x and x-zero-point must have the same data type.");if(e[1].dims.length!==0&&e[1].dims.length!==1&&e[1].dims.length!==e[0].dims.length)throw new Error("scale input must be a scalar, a 1D tensor, or have the same rank as the input tensor.");if(e.length>2){if(e[0].dataType!==e[2].dataType)throw new Error("x and x-zero-point must have the same data type.");if(e[1].dims.length!==e[2].dims.length)throw new Error("scale and zero-point inputs must have the same rank.");if(!e[1].dims.map((r,i)=>r===e[2].dims[i]).reduce((r,i)=>r&&i,!0))throw new Error("scale and zero-point inputs must have the same shape.")}if(t.blockSize>0){if(e[1].dims.length===0||e[1].dims.length===1&&e[1].dims[0]===1)throw new Error("blockSize must be set only for block quantization.");if(!e[1].dims.map((n,a)=>a===t.axis||n===e[0].dims[a]).reduce((n,a)=>n&&a,!0))throw new Error("For block qunatization, scale input shape to match the input shape except for the axis");if(e[1].dims.length!==e[0].dims.length)throw new Error("For block qunatization the scale input rank must be the same as the x rank.");let r=e[0].dims[t.axis],i=e[1].dims[t.axis];if(t.blockSize<Math.ceil(r/i)||t.blockSize>Math.ceil(r/(i-1)-1))throw new Error("blockSize must be with in the range [ceil(dI / Si), ceil(dI / (Si - 1) - 1)].")}},np=(e,t)=>{let r=R.normalizeAxis(t.axis,e[0].dims.length),i=e[0].dataType,n=i===3,a=e[0].dims,s=e[1].dataType,o=R.size(a),l=i===3||i===2,d=l?[Math.ceil(R.size(e[0].dims)/4)]:e[0].dims,h=e[1].dims,c=e.length>2?e[2]:void 0,f=c?l?[Math.ceil(R.size(c.dims)/4)]:c.dims:void 0,y=h.length===0||h.length===1&&h[0]===1,_=y===!1&&h.length===1,w=Ee(o),S=y&&(!l||w===4),v=S?w:1,b=S&&!l?w:1,T=D("input",l?12:i,d.length,b),E=D("scale",s,h.length),I=c?D("zero_point",l?12:i,f.length):void 0,C=H("output",s,a.length,v),z=[T,E];I&&z.push(I);let $=[d,h];c&&$.push(f);let B=[{type:12,data:o/v},{type:12,data:r},{type:12,data:t.blockSize},...Q(...$,a)],W=F=>{let q=[{name:"output_size",type:"u32"},{name:"axis",type:"u32"},{name:"block_size",type:"u32"}];return`
      ${F.registerUniforms(q).declareVariables(...z,C)}
      ${F.mainStart()}
          ${F.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          let output_indices = ${C.offsetToIndices("global_idx")};

          // Set input x
          ${l?`
            let input = ${T.getByOffset("global_idx / 4")};
            let x_vec = ${n?"unpack4xI8(input)":"unpack4xU8(input)"};
            let x_value = ${v===1?"x_vec[global_idx % 4]":"x_vec"};`:`let x_value = ${T.getByOffset("global_idx")};`};

          // Set scale input
          ${y?`let scale_value= ${E.getByOffset("0")}`:_?`
            let scale_index = ${C.indicesGet("output_indices","uniforms.axis")};
            let scale_value= ${E.getByOffset("scale_index")};`:`
            var scale_indices: ${E.type.indices} = output_indices;
            let index = ${E.indicesGet("scale_indices","uniforms.axis")} / uniforms.block_size;
            ${E.indicesSet("scale_indices","uniforms.axis","index")};
            let scale_value= ${E.getByIndices("scale_indices")};`};

          // Set zero-point input
          ${I?y?l?`
                let zero_point_input = ${I.getByOffset("0")};
                let zero_point_vec =  ${n?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value= zero_point_vec[0]`:`let zero_point_value = ${I.getByOffset("0")}`:_?l?`
                let zero_point_index = ${C.indicesGet("output_indices","uniforms.axis")};
                let zero_point_input = ${I.getByOffset("zero_point_index / 4")};
                let zero_point_vec =  ${n?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value = zero_point_vec[zero_point_index % 4]`:`
                let zero_point_index = ${C.indicesGet("output_indices","uniforms.axis")};
                let zero_point_value = ${I.getByOffset("zero_point_index")};`:l?`
                let zero_point_offset = ${E.indicesToOffset("scale_indices")};
                let zero_point_input = ${I.getByOffset("zero_point_offset / 4")};
                let zero_point_vec = ${n?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value = zero_point_vec[zero_point_offset % 4];`:`let zero_point_value = ${I.getByIndices("scale_indices")};`:`let zero_point_value = ${l?n?"i32":"u32":T.type.value}(0);`};
      // Compute and write output
      ${C.setByOffset("global_idx",`${C.type.value}(x_value - zero_point_value) * scale_value`)};
      }`};return{name:"DequantizeLinear",shaderCache:{hint:t.cacheKey,inputDependencies:I?["rank","rank","rank"]:["rank","rank"]},getShaderSource:W,getRunData:()=>({outputs:[{dims:a,dataType:s}],dispatchGroup:{x:Math.ceil(o/v/64),y:1,z:1},programUniforms:B})}},em=(e,t)=>{ip(e.inputs,t),e.compute(np(e.inputs,t))},tm=e=>fe({axis:e.axis,blockSize:e.blockSize})}),ap,sp,rm,Jy=L(()=>{"use strict";Ge(),te(),ae(),ap=(e,t,r)=>{let i=e===t,n=e<t&&r<0,a=e>t&&r>0;if(i||n||a)throw new Error("Range these inputs' contents are invalid.")},sp=(e,t,r,i)=>{let n=Math.abs(Math.ceil((t-e)/r)),a=[n],s=n,o=[{type:12,data:s},{type:i,data:e},{type:i,data:r},...Q(a)],l=d=>{let h=H("output",i,a.length),c=h.type.value,f=[{name:"outputSize",type:"u32"},{name:"start",type:c},{name:"delta",type:c}];return`
        ${d.registerUniforms(f).declareVariables(h)}
        ${d.mainStart()}
        ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
        output[global_idx] = uniforms.start + ${c}(global_idx) * uniforms.delta;
      }`};return{name:"Range",shaderCache:{hint:`${i}`},getShaderSource:l,getRunData:()=>({outputs:[{dims:a,dataType:i}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:o})}},rm=e=>{let t=0,r=0,i=0;e.inputs[0].dataType===6?(t=e.inputs[0].getInt32Array()[0],r=e.inputs[1].getInt32Array()[0],i=e.inputs[2].getInt32Array()[0]):e.inputs[0].dataType===1&&(t=e.inputs[0].getFloat32Array()[0],r=e.inputs[1].getFloat32Array()[0],i=e.inputs[2].getFloat32Array()[0]),ge.webgpu.validateInputContent&&ap(t,r,i),e.compute(sp(t,r,i,e.inputs[0].dataType),{inputs:[]})}}),op,up,im,nm,eb=L(()=>{"use strict";te(),ne(),Ie(),ae(),op=(e,t,r,i)=>{if(e!=="none"&&i!=="i32"&&i!=="u32"&&i!=="f32")throw new Error(`Input ${i} is not supported with reduction ${e}.`);let n=`{
                var oldValue = 0;
                loop {
                  let newValueF32 =`,a=`;
                  let newValue = bitcast<i32>(newValueF32);
                  let res = atomicCompareExchangeWeak(&${t}, oldValue, newValue);
                  if res.exchanged {
                    break;
                  }
                  oldValue = res.old_value;
                }
              }`;switch(e){case"none":return`${t}=${r};`;case"add":return i==="i32"||i==="u32"?`atomicAdd(&${t}, bitcast<${i}>(${r}));`:`
              ${n}bitcast<${i}>(oldValue) + (${r})${a}`;case"max":return i==="i32"||i==="u32"?`atomicMax(&${t}, bitcast<${i}>(${r}));`:`
                ${n}max(bitcast<f32>(oldValue), (${r}))${a}`;case"min":return i==="i32"||i==="u32"?`atomicMin(&${t}, bitcast<${i}>(${r}));`:`${n}min(bitcast<${i}>(oldValue), (${r}))${a}`;case"mul":return`${n}(bitcast<${i}>(oldValue) * (${r}))${a}`;default:throw new Error(`Reduction ${e} is not supported.`)}},up=(e,t)=>{let r=e[0].dims,i=e[1].dims,n=r,a=1,s=Math.ceil(R.sizeToDimension(i,i.length-1)/a),o=i[i.length-1],l=R.sizeFromDimension(r,o),d=[{type:12,data:s},{type:12,data:o},{type:12,data:l},...Q(e[1].dims,e[2].dims,n)],h=c=>{let f=D("indices",e[1].dataType,e[1].dims.length),y=D("updates",e[2].dataType,e[2].dims.length,a),_=t.reduction!=="none"&&t.reduction!==""?kc("output",e[0].dataType,n.length):H("output",e[0].dataType,n.length,a);return`
      ${c.registerUniform("output_size","u32").registerUniform("last_index_dimension","u32").registerUniform("num_updates_elements","u32").declareVariables(f,y,_)}
      ${c.mainStart()}
        ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
  var data_offset = 0u;
  let indices_start = uniforms.last_index_dimension * global_idx;
  let indices_end = indices_start + uniforms.last_index_dimension;
  for (var i = indices_start; i < indices_end; i++) {
    var index = i32(indices[i].x);
    ${e[0].dims.length===1?`
    let element_count_dim = uniforms.output_strides;
    let dim_value = uniforms.output_shape;`:`
    let element_count_dim = uniforms.output_strides[i - indices_start];
    let dim_value = uniforms.output_shape[i - indices_start];`}
    if (index >= 0) {
      if (index >= i32(dim_value)) {
        index = i32(dim_value - 1);
      }
    } else {
      if (index < -i32(dim_value)) {
        index = 0;
      } else {
        index += i32(dim_value);
      }
    }
    data_offset += u32((u32(index) * element_count_dim));
  }

  for (var i = 0u; i < uniforms.num_updates_elements; i++) {
    let value = updates[uniforms.num_updates_elements * global_idx + i];
    ${op(t.reduction,"output[data_offset + i]","value",_.type.value)}
  }

      }`};return{name:"ScatterND",shaderCache:{hint:`${t.cacheKey}_${t.reduction}`,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:n,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:d}),getShaderSource:h}},im=e=>fe({reduction:e.reduction}),nm=(e,t)=>{e.compute(up(e.inputs,t),{inputs:[e.inputs[1],e.inputs[2]],outputs:[]})}}),lp,dp,pp,Yn,cp,hp,fp,mp,gp,_p,yp,bp,Qn,wp,vp,$p,xp,Sp,am,sm,tb=L(()=>{"use strict";te(),ne(),Ie(),ae(),lp=(e,t)=>{if(e.every(r=>r>0||(()=>{throw new Error("Resize requires scales input values to be positive")})),e.length>0){if(t.mode==="linear"){if(!(e.length===2||e.length===3||e.length===4&&e[0]===1&&e[1]===1||e.length===4&&e[0]===1&&e[3]===1||e.length===5&&e[0]===1&&e[1]===1))throw new Error(`For linear mode, Resize requires scales to be 2D, 3D, 4D with either two outermost or one innermost and
            one outermost scale values equal to 1, or 5D with two outermost scale values equal to 1`)}else if(t.mode==="cubic"&&!(e.length===2||e.length===4&&e[0]===1&&e[1]===1||e.length===4&&e[0]===1&&e[3]===1))throw new Error("Resize requires scales input size to be 2 or 4 for cubic mode")}},dp=(e,t,r)=>{t.every(n=>n>=0&&n<r||(()=>{throw new Error("Resize requires axes input values to be positive and less than rank")}));let i=new Array(r).fill(1);return t.forEach((n,a)=>i[n]=e[a]),i},pp=(e,t,r,i,n,a)=>{let[s,o,l]=r>10?[1,2,3]:[-1,e.length>1?1:-1,-1],d=e[0].dims.length;if(s>0&&e.length>s&&e[s].dims.length>0)e[s].getFloat32Array().forEach(h=>a.push(h));else if(t.coordinateTransformMode==="tf_crop_and_resize")throw new Error("Resize requires RoI input to be specified when coordinateTransformMode is tfCropAndResize");if(o>0&&e.length>o&&e[o].dims.length===1&&e[o].dims[0]>0){if(e[o].getFloat32Array().forEach(h=>i.push(h)),i.length!==0&&i.length!==d&&r>=18&&i.length!==t.axes.length)throw new Error("Resize requires scales input size to be same as input rank or axes size for opset 18 and up");lp(i,t),t.axes.length>0&&dp(i,t.axes,d).forEach((h,c)=>i[c]=h)}if(l>0&&e.length>l&&e[l].dims.length===1&&e[l].dims[0]>0&&(e[l].getBigInt64Array().forEach(h=>n.push(Number(h))),n.length!==0&&n.length!==d&&r>=18&&n.length!==t.axes.length))throw new Error("Resize requires sizes input size to be same as input rank or axes size for opset 18 and up");if(t.axes.length>0){if(i.length!==0&&i.length!==t.axes.length)throw new Error('Resize requires "scales" input size to be of axes rank when axes attributes is specified');if(n.length!==0&&n.length!==t.axes.length)throw new Error('Resize requires "sizes" input size to be of rank axes rank when axes attributes is specified')}if(typeof i<"u"&&typeof n<"u"&&i.length>0&&n.length>d)throw new Error("Resize requires only of scales or sizes to be specified")},Yn=(e,t,r,i)=>`
  // The whole part and the fractional part are calculated separately due to inaccuracy of floating
  // point division. As an example, f32(21) / f32(7) may evaluate to 2.99... instead of 3, causing an
  // offset-by-one error later in floor().
  let big = (${e}) * (${t});
  let whole = ${i}(big / (${r}));
  let fract = ${i}(big % (${r})) / ${i}(${r});
  return whole + fract;
`,cp=(e,t)=>`fn getOriginalCoordinateFromResizedCoordinate(xResized: u32, xScale: f32, lengthResized: u32,
     lengthOriginal: u32, roiStart: f32, roiEnd: f32) -> ${t} { `+(()=>{switch(e){case"asymmetric":return`
          if (xScale < 1.0 || floor(xScale) != xScale) {
            return ${t}(xResized) / ${t}(xScale);
          } else {
            ${Yn("xResized","lengthOriginal","lengthResized",t)}
          }
        `;case"pytorch_half_pixel":return`if (lengthResized > 1) {
                    return (${t}(xResized) + 0.5) / ${t}(xScale) - 0.5;
                  } else {
                    return 0.0;
                  }`;case"tf_half_pixel_for_nn":return`return (${t}(xResized) + 0.5) / ${t}(xScale);`;case"align_corners":return`if (lengthResized == 1) {
                    return 0.0;
                  } else {
                    ${Yn("xResized","lengthOriginal - 1","lengthResized - 1",t)}
                  }`;case"tf_crop_and_resize":return`if (lengthResized > 1) {
                    return ${t}(roiStart) * ${t}(lengthOriginal - 1) +
                        (${t}(xResized) * ${t}(roiEnd - roiStart) * ${t}(lengthOriginal - 1)) /
                        ${t}(lengthResized - 1);
                  } else {
                    return 0.5 * ${t}(roiStart + roiEnd) * ${t}(lengthOriginal - 1);
                  }`;case"half_pixel_symmetric":return`const outputWidth = ${t}xScale * ${t}(lengthResized);
                  const adjustment = ${t}(lengthResized) / outputWidth;
                  const center = ${t}(lengthOriginal) / 2;
                  const offset = center * (1 - adjustment);
                  return offset + ((${t}(xResized) + 0.5) / ${t}(xScale)) - 0.5;`;case"half_pixel":return`return ((${t}(xResized) + 0.5) / ${t}(xScale)) - 0.5;`;default:throw new Error(`Coordinate transform mode ${e} is not supported`)}})()+"}",hp=(e,t,r)=>`fn getNearestPixelFromOriginal(xOriginal: ${r}, isDownSample: bool) -> ${r} {`+(()=>{switch(e){case"round_prefer_ceil":return"if (fract(xOriginal) == 0.5) {             return ceil(xOriginal);           } else {             return round(xOriginal);           }";case"floor":return"return floor(xOriginal);";case"ceil":return"return ceil(xOriginal);";case"round_prefer_floor":return"if (fract(xOriginal) == 0.5) {                     return floor(xOriginal);                   } else {                     return round(xOriginal);                   }";default:if(t<11)return"if (isDownSample)                     {                       return ceil(xOriginal);                     } else {                       return xOriginal;                     }";throw new Error(`Nearest mode ${e} is not supported`)}})()+"}",fp=(e,t,r)=>{let i=new Array(r).fill(0).concat(new Array(r).fill(1)),n=e.length===0?i:e.slice();return t.length>0?(t.forEach((a,s)=>{i[a]=n[s],i[s+r]=n[t.length+s]}),i):n},mp=(e,t,r,i)=>{let n=[];if(r.length>0)if(i.length>0){if(e.forEach(a=>n.push(a)),Math.max(...i)>e.length)throw new Error("axes is out of bound");i.forEach((a,s)=>n[a]=r[s])}else r.forEach(a=>n.push(a));else{if(t.length===0)throw new Error("Resize requires either scales or sizes.");n=e.map((a,s)=>Math.round(a*t[s]))}return n},gp=(e,t,r)=>{let i=(()=>{switch(r.keepAspectRatioPolicy){case"not_larger":return r.axes.length>0?Math.min(...r.axes.map(a=>t[a]),Number.MAX_VALUE):Math.min(...t,Number.MAX_VALUE);case"not_smaller":return r.axes.length>0?Math.max(...r.axes.map(a=>t[a]),Number.MIN_VALUE):Math.max(...t,Number.MIN_VALUE);default:throw new Error(`Keep aspect ratio policy ${r.keepAspectRatioPolicy} is not supported`)}})();t.fill(1,0,t.length);let n=e.slice();return r.axes.length>0?(r.axes.forEach(a=>t[a]=i),r.axes.forEach(a=>n[a]=Math.round(e[a]*t[a]))):(t.fill(i,0,t.length),n.forEach((a,s)=>n[s]=Math.round(a*t[s]))),n},_p=(e,t,r,i,n)=>`
    fn calculateOriginalIndicesFromOutputIndices(output_indices: ${e.type.indices}) -> array<${e.type.value}, ${r.length}> {
      var original_indices: array<${e.type.value}, ${r.length}>;
      for (var i:u32 = 0; i < ${r.length}; i++) {
        var output_index = ${e.indicesGet("output_indices","i")};
        var scale = ${Z("uniforms.scales","i",i)};
        var roi_low = ${Z("uniforms.roi","i",n)};
        var roi_hi = ${Z("uniforms.roi",`i + ${t.length}`,n)};
        if (scale == 1.0) {
          original_indices[i] = ${e.type.value}(output_index);
        } else {
          var input_shape_i = ${Z("uniforms.input_shape","i",t.length)};
          var output_shape_i = ${Z("uniforms.output_shape","i",r.length)};
          original_indices[i] = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                           input_shape_i, roi_low, roi_hi);
        }
      }
      return original_indices;
    }`,yp=(e,t,r,i,n,a,s)=>`
    fn calculateInputIndicesFromOutputIndices(output_indices: ${t.type.indices}) -> ${e.type.indices} {
      var input_indices: ${e.type.indices};
      for (var i:u32 = 0; i < ${i.length}; i++) {
        var output_index = ${t.indicesGet("output_indices","i")};
        var input_index: u32;
        var scale = ${Z("uniforms.scales","i",n)};
        if (scale == 1.0) {
          input_index = output_index;
        } else {
          var roi_low = ${Z("uniforms.roi","i",a)};
          var roi_hi = ${Z("uniforms.roi",`i + ${r.length}`,a)};
          var input_shape_i = ${Z("uniforms.input_shape","i",r.length)};
          var output_shape_i = ${Z("uniforms.output_shape","i",i.length)};
          var original_idx = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                        input_shape_i, roi_low, roi_hi);
          if (!${s} || (original_idx >= 0 && original_idx < ${t.type.value}(input_shape_i))) {
            if (original_idx < 0) {
              input_index = 0;
            } else if (original_idx > ${t.type.value}(input_shape_i - 1)) {
              input_index = input_shape_i - 1;
            } else {
              input_index = u32(getNearestPixelFromOriginal(original_idx, scale < 1));
            }
          } else {
            input_index = u32(original_idx);
          }
        }
        ${e.indicesSet("input_indices","i","input_index")}
      }
      return input_indices;
    }`,bp=(e,t)=>`
    fn checkInputIndices(input_indices: ${e.type.indices}) -> bool {
      for (var i:u32 = 0; i < ${t.length}; i++) {
        var input_index = ${e.indicesGet("input_indices","i")};
        if (input_index < 0 || input_index >= ${Z("uniforms.input_shape","i",t.length)}) {
          return false;
        }
      }
      return true;
    }`,Qn=(e,t,r,i)=>e.rank>i?`
    ${e.indicesSet("input_indices",t,"channel")};
    ${e.indicesSet("input_indices",r,"batch")};
`:"",wp=(e,t,r,i,n)=>{let[a,s,o,l]=r.length===2?[-1,0,1,-1]:[0,2,3,1],d=e.type.value;return`
    fn getInputValue(batch: u32, channel: u32, row: u32, col: u32) -> ${d} {
      var input_indices: ${e.type.indices};
      ${e.indicesSet("input_indices",s,`max(0, min(row, ${r[s]} - 1))`)};
      ${e.indicesSet("input_indices",o,`max(0, min(col, ${r[o]} - 1))`)};
      ${Qn(e,l,a,2)}
      return ${e.getByIndices("input_indices")};
    }

    fn bilinearInterpolation(output_indices: ${t.type.indices}) -> ${d} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var row:${d} = originalIndices[${s}];
      var col:${d} = originalIndices[${o}];
      ${i?`if (row < 0 || row > (${r[s]} - 1) || col < 0 || col > (${r[o]} - 1)) {
        return ${n};
      }`:""};
      row = max(0, min(row, ${r[s]} - 1));
      col = max(0, min(col, ${r[o]} - 1));
      var row1: u32 = u32(row);
      var col1: u32 = u32(col);
      var row2: u32 = u32(row + 1);
      var col2: u32 = u32(col + 1);
      var channel: u32 = ${r.length>2?`u32(originalIndices[${l}])`:"0"};
      var batch: u32 =  ${r.length>2?`u32(originalIndices[${a}])`:"0"};
      var x11: ${d} = getInputValue(batch, channel, row1, col1);
      var x12: ${d} = getInputValue(batch, channel, row1, col2);
      var x21: ${d} = getInputValue(batch, channel, row2, col1);
      var x22: ${d} = getInputValue(batch, channel, row2, col2);
      var dx1: ${d} = abs(row - ${d}(row1));
      var dx2: ${d} = abs(${d}(row2) - row);
      var dy1: ${d} = abs(col - ${d}(col1));
      var dy2: ${d} = abs(${d}(col2) - col);
      if (row1 == row2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (col1 == col2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      return (x11 * dx2 * dy2 + x12 * dx2 * dy1 + x21 * dx1 * dy2 + x22 * dx1 * dy1);
    }`},vp=(e,t,r,i,n,a,s,o,l,d)=>{let h=r.length===2,c=!0,[f,y]=h?[0,1]:c?[2,3]:[1,2],_=e.type.value,w=S=>{let v=S===f?"row":"col";return`
      fn ${v}CubicInterpolation(input_indices: ${e.type.indices}, output_indices: ${t.type.indices}) -> ${_} {
        var output_index = ${t.indicesGet("output_indices",S)};
        var originalIdx: ${_} = getOriginalCoordinateFromResizedCoordinate(output_index, ${n[S]},
        ${i[S]}, ${r[S]}, ${a[S]}, ${a[S]} + ${r.length});
        var fractOriginalIdx: ${_} = originalIdx - floor(originalIdx);
        var coefs = getCubicInterpolationCoefs(fractOriginalIdx);

        if (${o} && (originalIdx < 0 || originalIdx > (${r[S]} - 1))) {
          return ${l};
        }
        var data: array<${_}, 4> = array<${_}, 4>(0.0, 0.0, 0.0, 0.0);
        for (var i: i32 = -1; i < 3; i++) {
          var ${v}: ${_} = originalIdx + ${_}(i);
          if (${v} < 0 || ${v} >= ${r[S]}) {
            ${d?`coefs[i + 1] = 0.0;
                        continue;`:o?`return ${l};`:`${v} = max(0, min(${v}, ${r[S]} - 1));`};
          }
        var input_indices_copy: ${e.type.indices} = input_indices;
          ${e.indicesSet("input_indices_copy",S,`u32(${v})`)};
          data[i + 1] = ${S===f?e.getByIndices("input_indices_copy"):"rowCubicInterpolation(input_indices_copy, output_indices)"};
        }
        return cubicInterpolation1D(data, coefs);
      }`};return`
    ${w(f)};
    ${w(y)};
  fn getCubicInterpolationCoefs(s: ${_}) -> array<${_}, 4> {
    var absS = abs(s);
    var coeffs: array<${_}, 4> = array<${_}, 4>(0.0, 0.0, 0.0, 0.0);
    var oneMinusAbsS: ${_} = 1.0 - absS;
    var twoMinusAbsS: ${_} = 2.0 - absS;
    var onePlusAbsS: ${_} = 1.0 + absS;
    coeffs[0] = ((${s} * onePlusAbsS - 5 * ${s}) * onePlusAbsS + 8 * ${s}) * onePlusAbsS - 4 * ${s};
    coeffs[1] = ((${s} + 2) * absS - (${s} + 3)) * absS * absS + 1;
    coeffs[2] = ((${s} + 2) * oneMinusAbsS - (${s} + 3)) * oneMinusAbsS * oneMinusAbsS + 1;
    coeffs[3] = ((${s} * twoMinusAbsS - 5 * ${s}) * twoMinusAbsS + 8 * ${s}) * twoMinusAbsS - 4 * ${s};
    return coeffs;
  }

  fn cubicInterpolation1D(x: array<${_}, 4>, coefs: array<${_}, 4>) -> ${_} {
    var coefsSum: ${_} = coefs[0] + coefs[1] + coefs[2] + coefs[3];
    return (x[0] * coefs[0] + x[1] * coefs[1]+ x[2] * coefs[2]+ x[3] * coefs[3]) / coefsSum;
  }

  fn bicubicInterpolation(output_indices: ${t.type.indices}) -> ${_} {
    var input_indices: ${e.type.indices} = output_indices;
    return colCubicInterpolation(input_indices, output_indices);
  }
    `},$p=(e,t,r,i,n)=>{let[a,s,o,l,d]=r.length===3?[-1,0,1,2,-1]:[0,2,3,4,1],h=e.type.value;return`
    fn getInputValue(batch: u32, channel: u32, depth:u32, height: u32, width: u32) -> ${h} {
      var input_indices: ${e.type.indices};
      ${e.indicesSet("input_indices",s,`max(0, min(depth, ${r[s]} - 1))`)};
      ${e.indicesSet("input_indices",o,`max(0, min(height, ${r[o]} - 1))`)};
      ${e.indicesSet("input_indices",l,`max(0, min(width, ${r[l]} - 1))`)};
      ${Qn(e,d,a,3)}
      return ${e.getByIndices("input_indices")};
    }

    fn trilinearInterpolation(output_indices: ${t.type.indices}) -> ${h} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var depth:${h} = originalIndices[${s}];
      var height:${h} = originalIndices[${o}];
      var width:${h} = originalIndices[${l}];
      ${i?`if (depth < 0 || depth > (${r[s]} - 1) || height < 0 || height > (${r[o]} - 1) || width < 0 || (width > ${r[l]} - 1)) {
      return ${n};
        }`:""};

    depth = max(0, min(depth, ${r[s]} - 1));
      height = max(0, min(height, ${r[o]} - 1));
      width = max(0, min(width, ${r[l]} - 1));
      var depth1: u32 = u32(depth);
      var height1: u32 = u32(height);
      var width1: u32 = u32(width);
      var depth2: u32 = u32(depth + 1);
      var height2: u32 = u32(height + 1);
      var width2: u32 = u32(width + 1);
      var channel: u32 = ${r.length>3?`u32(originalIndices[${d}])`:"0"};
      var batch: u32 =  ${r.length>3?`u32(originalIndices[${a}])`:"0"};

      var x111: ${h} = getInputValue(batch, channel, depth1, height1, width1);
      var x112: ${h} = getInputValue(batch, channel, depth1, height1, width2);
      var x121: ${h} = getInputValue(batch, channel, depth1, height2, width1);
      var x122: ${h} = getInputValue(batch, channel, depth1, height2, width2);
      var x211: ${h} = getInputValue(batch, channel, depth2, height1, width1);
      var x212: ${h} = getInputValue(batch, channel, depth2, height1, width2);
      var x221: ${h} = getInputValue(batch, channel, depth2, height2, width1);
      var x222: ${h} = getInputValue(batch, channel, depth2, height2, width2);
      var dx1: ${h} = abs(depth - ${h}(depth1));
      var dx2: ${h} = abs(${h}(depth2) - depth);
      var dy1: ${h} = abs(height - ${h}(height1));
      var dy2: ${h} = abs(${h}(height2) - height);
      var dz1: ${h} = abs(width - ${h}(width1));
      var dz2: ${h} = abs(${h}(width2) - width);
      if (depth1 == depth2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (height1 == height2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      if (width1 == width2) {
        dz1 = 0.5;
        dz2 = 0.5;
      }
      return (x111 * dx2 * dy2 * dz2 + x112 * dx2 * dy2 * dz1 + x121 * dx2 * dy1 *dz2 + x122 * dx2 * dy1 * dz1 +
              x211 * dx1 * dy2 * dz2 + x212 * dx1 * dy2 * dz1 + x221 * dx1 * dy1 *dz2 + x222 * dx1 * dy1 * dz1);
    }`},xp=(e,t,r,i,n,a)=>{let s=e.dims,o=fp(a,t.axes,s.length),l=mp(s,i,n,t.axes),d=i.slice();i.length===0&&(d=s.map((b,T)=>b===0?1:l[T]/b),t.keepAspectRatioPolicy!=="stretch"&&(l=gp(s,d,t)));let h=H("output",e.dataType,l.length),c=D("input",e.dataType,s.length),f=R.size(l),y=s.length===l.length&&s.every((b,T)=>b===l[T]),_=t.coordinateTransformMode==="tf_crop_and_resize",w=t.extrapolationValue,S=c.type.value,v=b=>`
      ${y?"":`
      ${cp(t.coordinateTransformMode,S)};
      ${(()=>{switch(t.mode){case"nearest":return`
              ${bp(c,s)};
              ${hp(t.nearestMode,r,S)};
              ${yp(c,h,s,l,d.length,o.length,_)};
              `;case"linear":return`
              ${_p(h,s,l,d.length,o.length)};
              ${(()=>{if(s.length===2||s.length===4)return`${wp(c,h,s,_,w)}`;if(s.length===3||s.length===5)return`${$p(c,h,s,_,w)}`;throw Error("Linear mode only supports input dims 2, 3, 4 and 5 are supported in linear mode.")})()};
            `;case"cubic":return`
            ${(()=>{if(s.length===2||s.length===4)return`${vp(c,h,s,l,d,o,t.cubicCoeffA,_,t.extrapolationValue,t.excludeOutside)}`;throw Error("Cubic mode only supports input dims 2 and 4 are supported in linear mode.")})()};
            `;default:throw Error("Invalid resize mode")}})()};
      `}
      ${b.registerUniform("output_size","u32").registerUniform("scales","f32",d.length).registerUniform("roi","f32",o.length).declareVariables(c,h)}
      ${b.mainStart()}
        ${b.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
        ${y?"output[global_idx] = input[global_idx];":`
        let output_indices = ${h.offsetToIndices("global_idx")};
        var input_indices: ${c.type.indices};
        ${(()=>{switch(t.mode){case"nearest":return`input_indices = calculateInputIndicesFromOutputIndices(output_indices);
                if (checkInputIndices(input_indices)) {
                  output[global_idx] = ${c.getByIndices("input_indices")};
                } else {
                  output[global_idx] = ${t.extrapolationValue};
                }`;case"linear":return`output[global_idx] = ${s.length===2||s.length===4?"bilinearInterpolation":"trilinearInterpolation"}(output_indices);`;case"cubic":return"output[global_idx] = bicubicInterpolation(output_indices);";default:throw Error(`Unsupported resize mode: ${t.mode}`)}})()};
`}
      }`;return{name:"Resize",shaderCache:{hint:`${t.cacheKey}|${r}|${d.length>0?t.mode==="cubic"?d:d.length:""}|${n.length>0?n:""}|${o.length>0?o:""}|${y}|${t.mode==="nearest"?s.length:s}`,inputDependencies:["rank"]},getShaderSource:v,getRunData:()=>({outputs:[{dims:l,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(f/64)},programUniforms:[{type:12,data:f},{type:1,data:d},{type:1,data:o},...Q(s,l)]})}},Sp=e=>{let t=e.customDataBuffer;return new Uint32Array(t.buffer,t.byteOffset,1)[0]},am=(e,t)=>{let r=[],i=[],n=[],a=Sp(e);if(t.antialias!==0)throw Error("Only default value (0) for Antialias attribute is supported");pp(e.inputs,t,a,r,i,n),e.compute(xp(e.inputs[0],t,a,r,i,n),{inputs:[0]})},sm=e=>{let t=e.antialias,r=e.axes,i=e.coordinateTransformMode,n=e.cubicCoeffA,a=e.excludeOutside!==0,s=e.extrapolationValue,o=e.keepAspectRatioPolicy,l=e.mode,d=e.nearestMode===""?"simple":e.nearestMode;return fe({antialias:t,axes:r,coordinateTransformMode:i,cubicCoeffA:n,excludeOutside:a,extrapolationValue:s,keepAspectRatioPolicy:o,mode:l,nearestMode:d})}}),Tp,Ep,om,rb=L(()=>{"use strict";te(),ne(),ae(),Tp=e=>{if(!e||e.length<3)throw new Error("layerNorm requires at least 3 inputs.");let t=e[0],r=e[1],i=e[2];if(t.dataType!==r.dataType||t.dataType!==i.dataType)throw new Error("All inputs must have the same data type");if(t.dims.length!==3&&t.dims.length!==2)throw new Error("Input must be 2D or 3D");if(r.dims.length!==3&&r.dims.length!==2)throw new Error("Skip must be 2D or 3D");let n=t.dims[t.dims.length-1],a=t.dims[t.dims.length-2];if(r.dims[r.dims.length-1]!==n)throw new Error("Skip must have the same hidden size as input");if(r.dims[r.dims.length-2]!==a)throw new Error("Skip must have the same sequence length as input");if(i.dims.length!==1)throw new Error("Gamma must be 1D");if(i.dims[i.dims.length-1]!==n)throw new Error("Gamma must have the same hidden size as input");if(e.length>3){let s=e[3];if(s.dims.length!==1)throw new Error("Beta must be 1D");if(s.dims[s.dims.length-1]!==n)throw new Error("Beta must have the same hidden size as input")}if(e.length>4){let s=e[4];if(s.dims.length!==1)throw new Error("Bias must be 1D");if(s.dims[s.dims.length-1]!==n)throw new Error("Bias must have the same hidden size as input")}},Ep=(e,t,r,i)=>{let n=t.simplified,a=e[0].dims,s=R.size(a),o=a,l=s,d=a.slice(-1)[0],h=i?a.slice(0,-1).concat(1):[],c=!n&&e.length>3,f=e.length>4,y=i&&r>1,_=i&&r>2,w=r>3,S=64,v=Ee(d),b=[{type:12,data:l},{type:12,data:v},{type:12,data:d},{type:1,data:t.epsilon}],T=I=>{let C=[{name:"output_size",type:"u32"},{name:"components",type:"u32"},{name:"hidden_size",type:"u32"},{name:"epsilon",type:"f32"}],z=[D("x",e[0].dataType,e[0].dims,v),D("skip",e[1].dataType,e[1].dims,v),D("gamma",e[2].dataType,e[2].dims,v)];c&&z.push(D("beta",e[3].dataType,e[3].dims,v)),f&&z.push(D("bias",e[4].dataType,e[4].dims,v)),z.push(H("output",e[0].dataType,o,v)),y&&z.push(H("mean_output",1,h)),_&&z.push(H("inv_std_output",1,h)),w&&z.push(H("input_skip_bias_sum",e[0].dataType,o,v));let $=ze(e[0].dataType),B=ze(1,v);return`

      ${I.registerUniforms(C).declareVariables(...z)}
      var<workgroup> sum_shared : array<${B}, ${S}>;
      var<workgroup> sum_squared_shared : array<${B}, ${S}>;

      ${I.mainStart([S,1,1])}
        let ix = local_id.x;
        let iy = global_id.x / ${S};

        let hidden_size_vectorized: u32 = uniforms.hidden_size / uniforms.components;
        var stride = hidden_size_vectorized / ${S};
        let offset = ix * stride + iy * hidden_size_vectorized;
        let offset1d = stride * ix;
        if (ix == ${S-1}) {
          stride = hidden_size_vectorized - stride * ix;
        }
        for (var i: u32 = 0; i < stride; i++) {
          let skip_value = skip[offset + i];
          let bias_value = ${f?"bias[offset1d + i]":$+"(0.0)"};
          let input_value = x[offset + i];
          let value = input_value + skip_value + bias_value;
          ${w?"input_skip_bias_sum[offset + i] = value;":""}
          output[offset + i] = value;
          let f32_value = ${Yt($,v,"value")};
          sum_shared[ix] += f32_value;
          sum_squared_shared[ix] += f32_value * f32_value;
        }
        workgroupBarrier();

        var reduce_size : u32 = ${S};
        for (var curr_size = reduce_size >> 1;  curr_size > 0; curr_size = reduce_size >> 1) {
          reduce_size = curr_size + (reduce_size & 1);
          if (ix < curr_size) {
            sum_shared[ix] += sum_shared[ix + reduce_size];
            sum_squared_shared[ix] += sum_squared_shared[ix + reduce_size];
          }
          workgroupBarrier();
        }

        let sum = sum_shared[0];
        let square_sum = sum_squared_shared[0];
        let mean = ${Tt("sum",v)} / f32(uniforms.hidden_size);
        let inv_std_dev = inverseSqrt(${Tt("square_sum",v)} / f32(uniforms.hidden_size) ${n?"":"- mean * mean"} + uniforms.epsilon);
        ${y?"mean_output[global_idx] = mean;":""}
        ${_?"inv_std_output[global_idx] = inv_std_dev;":""}

        for (var i: u32 = 0; i < stride; i++) {
          output[offset + i] = (output[offset + i] ${n?"":`- ${$}(mean)`}) *
            ${$}(inv_std_dev) * gamma[offset1d + i]
            ${c?"+ beta[offset1d + i]":""};
        }
      }`},E=[{dims:o,dataType:e[0].dataType}];return r>1&&E.push({dims:h,dataType:1}),r>2&&E.push({dims:h,dataType:1}),r>3&&E.push({dims:a,dataType:e[0].dataType}),{name:"SkipLayerNormalization",shaderCache:{hint:`${v};${y};${_};${w}`,inputDependencies:e.map((I,C)=>"type")},getShaderSource:T,getRunData:()=>({outputs:E,dispatchGroup:{x:Math.ceil(l/d)},programUniforms:b})}},om=(e,t)=>{Tp(e.inputs);let r=[0];e.outputCount>1&&r.push(-3),e.outputCount>2&&r.push(-3),e.outputCount>3&&r.push(3),e.compute(Ep(e.inputs,t,e.outputCount,!1),{outputs:r})}}),Ip,vr,kp,Jn,Cp,zp,um,lm,ib=L(()=>{"use strict";te(),ne(),Ie(),ae(),Ip=(e,t)=>{if(!e||e.length<1)throw new Error("too few inputs");if(t.axes.length!==0){if(t.axes.length!==t.starts.length||t.axes.length!==t.ends.length)throw new Error("axes, starts and ends must have the same length")}else if(t.starts.length!==t.ends.length)throw new Error("starts and ends must have the same length");e.slice(1).forEach((r,i)=>{if(e[i+1].dataType!==6&&e[i+1].dataType!==7)throw new Error(`Input ${i} must be an array of int32 or int64`)})},vr=(e,t)=>{let r=[];if(e.length>t)if(e[t].dataType===7)e[t].getBigInt64Array().forEach(i=>r.push(Number(i)));else if(e[t].dataType===6)e[t].getInt32Array().forEach(i=>r.push(Number(i)));else throw new Error(`Input ${t} must be an array of int32 or int64`);return r},kp=(e,t)=>{if(e.length>1){let r=vr(e,1),i=vr(e,2),n=vr(e,3);return n.length===0&&(n=[...Array(e[0].dims.length).keys()]),fe({starts:r,ends:i,axes:n})}else return t},Jn=(e,t,r,i,n)=>{let a=e;return e<0&&(a+=r[i[t]]),n[t]<0?Math.max(0,Math.min(a,r[i[t]]-1)):Math.max(0,Math.min(a,r[i[t]]))},Cp=(e,t,r)=>`fn calculateInputIndices(output_indices: ${t.type.indices}) -> ${e.type.indices} {
          var input_indices: ${e.type.indices};
          var carry = 0u;
          for (var i = ${r.length-1}; i >= 0; i--) {
            let input_shape_i = ${Z("uniforms.input_shape","i",r.length)};
            let steps_i = ${Z("uniforms.steps","i",r.length)};
            let signs_i = ${Z("uniforms.signs","i",r.length)};
            let starts_i = ${Z("uniforms.starts","i",r.length)};
            var output_index = ${t.indicesGet("output_indices","i")};
            var input_index = output_index * steps_i + starts_i + carry;
            carry = input_index / input_shape_i;
            input_index = input_index % input_shape_i;
            if (signs_i < 0) {
              input_index = input_shape_i - input_index - 1u + starts_i;
            }
            ${e.indicesSet("input_indices","i","input_index")};
          }
          return input_indices;
      }`,zp=(e,t)=>{let r=e[0].dims,i=R.size(r),n=t.axes.length>0?R.normalizeAxes(t.axes,r.length):[...Array(r.length).keys()],a=vr(e,4);a.forEach(v=>v!==0||(()=>{throw new Error("step cannot be 0")})),a.length===0&&(a=Array(n.length).fill(1));let s=t.starts.map((v,b)=>Jn(v,b,r,n,a)),o=t.ends.map((v,b)=>Jn(v,b,r,n,a));if(n.length!==s.length||n.length!==o.length)throw new Error("start, ends and axes should have the same number of elements");if(n.length!==r.length)for(let v=0;v<r.length;++v)n.includes(v)||(s.splice(v,0,0),o.splice(v,0,r[v]),a.splice(v,0,1));let l=a.map(v=>Math.sign(v));a.forEach((v,b,T)=>{if(v<0){let E=(o[b]-s[b])/v,I=s[b],C=I+E*a[b];s[b]=C,o[b]=I,T[b]=-v}});let d=r.slice(0);n.forEach((v,b)=>{d[v]=Math.ceil((o[v]-s[v])/a[v])});let h={dims:d,dataType:e[0].dataType},c=H("output",e[0].dataType,d.length),f=D("input",e[0].dataType,e[0].dims.length),y=R.size(d),_=[{name:"outputSize",type:"u32"},{name:"starts",type:"u32",length:s.length},{name:"signs",type:"i32",length:l.length},{name:"steps",type:"u32",length:a.length}],w=[{type:12,data:y},{type:12,data:s},{type:6,data:l},{type:12,data:a},...Q(e[0].dims,d)],S=v=>`
      ${v.registerUniforms(_).declareVariables(f,c)}
        ${Cp(f,c,r)}
        ${v.mainStart()}
          ${v.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
          let output_indices = ${c.offsetToIndices("global_idx")};
          let input_indices = calculateInputIndices(output_indices);
          ${c.setByOffset("global_idx",f.getByIndices("input_indices"))}
      }`;return{name:"Slice",shaderCache:{hint:`${l.length}_${s.length}_${a.length}`,inputDependencies:["rank"]},getShaderSource:S,getRunData:()=>({outputs:[h],dispatchGroup:{x:Math.ceil(i/64)},programUniforms:w})}},um=(e,t)=>{Ip(e.inputs,t);let r=kp(e.inputs,t);e.compute(zp(e.inputs,r),{inputs:[0]})},lm=e=>{let t=e.starts,r=e.ends,i=e.axes;return fe({starts:t,ends:r,axes:i})}}),Op,Ap,dm,pm,nb=L(()=>{"use strict";te(),ne(),Ie(),Et(),ae(),Op=e=>{if(!e||e.length!==1)throw new Error("Softmax op requires 1 input.")},Ap=(e,t)=>{let r=e.inputs[0],i=r.dims,n=R.size(i),a=i.length,s=R.normalizeAxis(t.axis,a),o=s<i.length-1,l,d=[];o?(d=Array.from({length:a},(z,$)=>$),d[s]=a-1,d[a-1]=s,l=e.compute(Ue(r,d),{inputs:[r],outputs:[-1]})[0]):l=r;let h=l.dims,c=h[a-1],f=n/c,y=Ee(c),_=c/y,w=64;f===1&&(w=256);let S=(z,$)=>$===4?`max(max(${z}.x, ${z}.y), max(${z}.z, ${z}.w))`:$===2?`max(${z}.x, ${z}.y)`:$===3?`max(max(${z}.x, ${z}.y), ${z}.z)`:z,v=D("x",l.dataType,l.dims,y),b=H("result",l.dataType,l.dims,y),T=v.type.value,E=ze(l.dataType)==="f32"?`var threadMax = ${T}(-3.4028234663852886e+38f);`:`var threadMax = ${T}(-65504.0h);`,I=z=>`
      var<workgroup> rowMaxShared : ${T};
      var<workgroup> rowSumShared : ${T};
      var<workgroup> threadShared : array<${T}, ${w}>;

      fn getValue(row: i32, col: i32, row_stride: i32) -> ${T} {
        let index = row * row_stride + col;
        return x[index];
      }

      fn setValue(row: i32, col: i32, row_stride: i32, value: ${T}) {
        let index = row * row_stride + col;
        result[index] = value;
      }
      ${z.registerUniform("packedCols","i32").declareVariables(v,b)}
      ${z.mainStart(w)}
        let gindex = i32(global_idx);
        let lindex = i32(local_idx);
        const wg = ${w};
        let row = gindex / wg;
        let cols = uniforms.packedCols;
        let row_stride : i32 = uniforms.packedCols;

        // find the rows max
        ${E}
        for (var col = lindex; col < cols; col += wg) {
          let value = getValue(row, col, row_stride);
          threadMax = max(threadMax, value);
        }
        if (lindex < cols) {
          threadShared[lindex] = threadMax;
        }
        workgroupBarrier();

        var reduceSize = min(cols, wg);
        for (var currSize = reduceSize >> 1;  currSize > 0; currSize = reduceSize >> 1) {
          reduceSize = currSize + (reduceSize & 1);
          if (lindex < currSize) {
            threadShared[lindex] = max(threadShared[lindex], threadShared[lindex + reduceSize]);
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowMaxShared = ${T}(${S("threadShared[0]",y)});
        }
        workgroupBarrier();

        // find the rows sum
        var threadSum = ${T}(0.0);
        for (var col = lindex; col < cols; col += wg) {
          let subExp = exp(getValue(row, col, row_stride) - rowMaxShared);
          threadSum += subExp;
        }
        threadShared[lindex] = threadSum;
        workgroupBarrier();

        for (var currSize = wg >> 1;  currSize > 0; currSize = currSize >> 1) {
          if (lindex < currSize) {
            threadShared[lindex] = threadShared[lindex] + threadShared[lindex + currSize];
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowSumShared = ${T}(${Tt("threadShared[0]",y)});
        }
        workgroupBarrier();

        // calculate final value for each element in the row
        for (var col = lindex; col < cols; col += wg) {
          var value = exp(getValue(row, col, row_stride) - rowMaxShared) / rowSumShared;
          // max operation protects against NaN since all values should be >=0
          value = max(value, ${T}(0.0));
          setValue(row, col, row_stride, value);
        }
      }`,C=e.compute({name:"Softmax",shaderCache:{hint:`${y};${w}`,inputDependencies:["type"]},getRunData:()=>({outputs:[{dims:h,dataType:l.dataType}],dispatchGroup:{x:f},programUniforms:[{type:6,data:_}]}),getShaderSource:I},{inputs:[l],outputs:[o?-1:0]})[0];o&&e.compute(Ue(C,d),{inputs:[C]})},dm=(e,t)=>{Op(e.inputs),Ap(e,t)},pm=e=>fe({axis:e.axis})}),ea,Rp,Dp,Mp,cm,ab=L(()=>{"use strict";te(),ne(),ae(),ea=e=>Array.from(e.getBigInt64Array(),Number),Rp=e=>{if(!e||e.length!==2)throw new Error("Tile requires 2 inputs.");if(e[0].dataType!==1&&e[0].dataType!==10&&e[0].dataType!==6&&e[0].dataType!==12)throw new Error("Tile only support float, float16, int32, and uint32 data types");if(e[1].dataType!==7)throw new Error("Tile `repeats` input should be of int64 data type");if(e[1].dims.length!==1)throw new Error("Tile `repeats` input should be 1-D");if(ea(e[1]).length!==e[0].dims.length)throw new Error("Tile `repeats` input should have same number of elements as rank of input data tensor")},Dp=(e,t)=>{let r=[];for(let i=0;i<e.length;++i)r.push(e[i]*t[i]);return r},Mp=(e,t)=>{let r=e[0].dims,i=t??ea(e[1]),n=Dp(r,i),a=R.size(n),s=e[0].dataType,o=D("input",s,r.length),l=H("output",s,n.length),d=h=>`
      const inputShape = ${o.indices(...r)};
      ${h.registerUniform("output_size","u32").declareVariables(o,l)}
      ${h.mainStart()}
      ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let output_indices = ${l.offsetToIndices("global_idx")};
      var input_indices: ${o.type.indices};
      for (var i = 0; i < ${r.length}; i++) {
        let input_dim_i = ${o.indicesGet("uniforms.input_shape","i")};
        let input_dim_value = ${l.indicesGet("output_indices","i")}  % input_dim_i;

        ${o.indicesSet("input_indices","i","input_dim_value")}
      }
      ${l.setByOffset("global_idx",o.getByIndices("input_indices"))}
    }`;return{name:"Tile",shaderCache:{hint:`${i}`,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:n,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(a/64)},programUniforms:[{type:12,data:a},...Q(e[0].dims,n)]}),getShaderSource:d}},cm=e=>{Rp(e.inputs),e.compute(Mp(e.inputs),{inputs:[0]})}}),Bp,Np,hm,sb=L(()=>{"use strict";te(),ne(),ae(),Bp=(e,t,r,i,n)=>{let a=H("output_data",n,r.length,4),s=D("a_data",t[1].dataType,t[1].dims.length,4),o=D("b_data",t[2].dataType,t[2].dims.length,4),l=D("c_data",t[0].dataType,t[0].dims.length,4),d,h=(c,f,y)=>`select(${f}, ${c}, ${y})`;if(!i)d=a.setByOffset("global_idx",h(s.getByOffset("global_idx"),o.getByOffset("global_idx"),l.getByOffset("global_idx")));else{let c=(f,y,_="")=>{let w=`a_data[index_a${y}][component_a${y}]`,S=`b_data[index_b${y}][component_b${y}]`,v=`bool(c_data[index_c${y}] & (0xffu << (component_c${y} * 8)))`;return`
            let output_indices${y} = ${a.offsetToIndices(`global_idx * 4u + ${y}u`)};
            let offset_a${y} = ${s.broadcastedIndicesToOffset(`output_indices${y}`,a)};
            let offset_b${y} = ${o.broadcastedIndicesToOffset(`output_indices${y}`,a)};
            let offset_c${y} = ${l.broadcastedIndicesToOffset(`output_indices${y}`,a)};
            let index_a${y} = offset_a${y} / 4u;
            let index_b${y} = offset_b${y} / 4u;
            let index_c${y} = offset_c${y} / 4u;
            let component_a${y} = offset_a${y} % 4u;
            let component_b${y} = offset_b${y} % 4u;
            let component_c${y} = offset_c${y} % 4u;
            ${f}[${y}] = ${_}(${h(w,S,v)});
          `};n===9?d=`
            var data = vec4<u32>(0);
            ${c("data",0,"u32")}
            ${c("data",1,"u32")}
            ${c("data",2,"u32")}
            ${c("data",3,"u32")}
            output_data[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));`:d=`
            ${c("output_data[global_idx]",0)}
            ${c("output_data[global_idx]",1)}
            ${c("output_data[global_idx]",2)}
            ${c("output_data[global_idx]",3)}
          `}return`
        ${e.registerUniform("vec_size","u32").declareVariables(l,s,o,a)}
        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
        ${d}
      }`},Np=e=>{let t=e[1].dims,r=e[2].dims,i=e[0].dims,n=e[1].dataType,a=!(R.areEqual(t,r)&&R.areEqual(r,i)),s=t,o=R.size(t);if(a){let d=Qt.calcShape(Qt.calcShape(t,r,!1),i,!1);if(!d)throw new Error("Can't perform where op on the given tensors");s=d,o=R.size(s)}let l=Math.ceil(o/4);return{name:"Where",shaderCache:{inputDependencies:["rank","rank","rank"]},getShaderSource:d=>Bp(d,e,s,a,n),getRunData:()=>({outputs:[{dims:s,dataType:n}],dispatchGroup:{x:Math.ceil(o/64/4)},programUniforms:[{type:12,data:l},...Q(i,t,r,s)]})}},hm=e=>{e.compute(Np(e.inputs))}}),fm,ob=L(()=>{"use strict";wy(),Ma(),vy(),$y(),xy(),Sy(),Ty(),zy(),Ay(),Ry(),Dy(),My(),By(),Ny(),Py(),Ly(),Uy(),Wy(),qy(),Vy(),Gy(),Fy(),Hy(),jy(),Ky(),Xy(),Rf(),Zy(),Yy(),Qy(),Jy(),eb(),Da(),tb(),Pf(),rb(),ib(),nb(),Bf(),ab(),Et(),Ba(),sb(),fm=new Map([["Abs",[ih]],["Acos",[nh]],["Acosh",[ah]],["Add",[Uh]],["ArgMax",[Jc,da]],["ArgMin",[Qc,da]],["Asin",[sh]],["Asinh",[oh]],["Atan",[uh]],["Atanh",[lh]],["Attention",[eh]],["AveragePool",[jf,Hf]],["BatchNormalization",[th]],["BiasAdd",[rh]],["BiasSplitGelu",[Lh]],["Cast",[ph,dh]],["Ceil",[hh]],["Clip",[ch]],["Concat",[Zh,Yh]],["Conv",[ga,ma]],["ConvTranspose",[uf,of]],["Cos",[fh]],["Cosh",[mh]],["CumSum",[lf,df]],["DepthToSpace",[pf,cf]],["DequantizeLinear",[em,tm]],["DFT",[hf,ff]],["Div",[Wh]],["Einsum",[mf,gf]],["Elu",[gh,Tr]],["Equal",[qh]],["Erf",[_h]],["Exp",[yh]],["Expand",[_f]],["FastGelu",[yf]],["Floor",[bh]],["FusedConv",[ga,ma]],["Gather",[wf,bf]],["GatherElements",[Ef,Tf]],["GatherBlockQuantized",[xf,Sf]],["GatherND",[vf,$f]],["Gelu",[wh]],["Gemm",[kf,If]],["GlobalAveragePool",[Xf,Kf]],["GlobalMaxPool",[Jf,Qf]],["Greater",[Hh]],["GreaterOrEqual",[Kh]],["GridSample",[Cf,zf]],["GroupQueryAttention",[Lf]],["HardSigmoid",[kh,Ih]],["HardSwish",[Ch]],["InstanceNormalization",[Uf]],["LayerNormalization",[Wf]],["LeakyRelu",[vh,Tr]],["Less",[jh]],["LessOrEqual",[Xh]],["Log",[Nh]],["MatMul",[qf]],["MatMulNBits",[Vf,Gf]],["MaxPool",[Zf,Yf]],["Mul",[Vh]],["MultiHeadAttention",[Af,Of]],["Neg",[xh]],["Not",[$h]],["Pad",[Ff]],["Pow",[Gh]],["QuickGelu",[Ph,Tr]],["Range",[rm]],["Reciprocal",[Sh]],["ReduceMin",[jc]],["ReduceMean",[qc]],["ReduceMax",[Hc]],["ReduceSum",[Xc]],["ReduceProd",[Kc]],["ReduceL1",[Vc]],["ReduceL2",[Gc]],["ReduceLogSum",[Yc]],["ReduceLogSumExp",[Fc]],["ReduceSumSquare",[Zc]],["Relu",[Th]],["Resize",[am,sm]],["RotaryEmbedding",[Nf]],["ScatterND",[nm,im]],["Sigmoid",[Eh]],["Sin",[zh]],["Sinh",[Oh]],["Slice",[um,lm]],["SkipLayerNormalization",[om]],["Split",[Df,Mf]],["Sqrt",[Ah]],["Softmax",[dm,pm]],["Sub",[Fh]],["Tan",[Rh]],["Tanh",[Dh]],["ThresholdedRelu",[Bh,Tr]],["Tile",[cm]],["Transpose",[zc,Oc]],["Where",[hm]]])}),mm,ub=L(()=>{"use strict";Ge(),dt(),ae(),mm=class{constructor(e){this.backend=e,this.repo=new Map,this.attributesBound=!1}getArtifact(e){return this.repo.get(e)}setArtifact(e,t){this.repo.set(e,t)}run(e,t,r,i,n){et(e.programInfo.name);let a=this.backend.device,s=this.backend.getComputePassEncoder();this.backend.writeTimestamp(this.backend.pendingDispatchNumber*2);let o=[];for(let d of t)o.push({binding:o.length,resource:{buffer:d.buffer}});for(let d of r)o.push({binding:o.length,resource:{buffer:d.buffer}});n&&o.push({binding:o.length,resource:n});let l=a.createBindGroup({layout:e.computePipeline.getBindGroupLayout(0),entries:o,label:e.programInfo.name});if(this.backend.sessionStatus==="capturing"){let d={kernelId:this.backend.currentKernelId,computePipeline:e.computePipeline,bindGroup:l,dispatchGroup:i};this.backend.capturedCommandList.get(this.backend.currentSessionId).push(d)}s.setPipeline(e.computePipeline),s.setBindGroup(0,l),s.dispatchWorkgroups(...i),this.backend.writeTimestamp(this.backend.pendingDispatchNumber*2+1),this.backend.pendingDispatchNumber++,(this.backend.pendingDispatchNumber>=this.backend.maxDispatchNumber||this.backend.queryType==="at-passes")&&this.backend.endComputePass(),this.backend.pendingDispatchNumber>=this.backend.maxDispatchNumber&&this.backend.flush(),Ve(e.programInfo.name)}dispose(){}build(e,t){et(e.name);let r=this.backend.device,i=[];[{feature:"shader-f16",extension:"f16"},{feature:"subgroups",extension:"subgroups"}].forEach(d=>{r.features.has(d.feature)&&i.push(`enable ${d.extension};`)});let n=Cc(t,this.backend.device.limits),a=e.getShaderSource(n),s=`${i.join(`
`)}
${n.additionalImplementations}
${a}`,o=r.createShaderModule({code:s,label:e.name});pe("verbose",()=>`[WebGPU] ${e.name} shader code: ${s}`);let l=r.createComputePipeline({compute:{module:o,entryPoint:"main"},layout:"auto",label:e.name});return Ve(e.name),{programInfo:e,computePipeline:l,uniformVariablesInfo:n.variablesInfo}}normalizeDispatchGroupSize(e){let t=typeof e=="number"?e:e.x,r=typeof e=="number"?1:e.y||1,i=typeof e=="number"?1:e.z||1,n=this.backend.device.limits.maxComputeWorkgroupsPerDimension;if(t<=n&&r<=n&&i<=n)return[t,r,i];let a=t*r*i,s=Math.ceil(Math.sqrt(a));if(s>n){if(s=Math.ceil(Math.cbrt(a)),s>n)throw new Error("Total dispatch size exceeds WebGPU maximum.");return[s,s,s]}else return[s,s,1]}}}),gm={};er(gm,{WebGpuBackend:()=>_m});var Pp,Lp,Up,_m,lb=L(()=>{"use strict";Ge(),te(),dt(),Sc(),yy(),ob(),ub(),Pp=(e,t)=>{if(t.length!==e.length)throw new Error(`inputDependencies length ${t.length} is not equal to inputTensors length ${e.length}.`);let r=[];for(let i=0;i<e.length;++i){let n=e[i].dataType;switch(t[i]){case"none":{r.push("");break}case"type":{r.push(`${n}`);break}case"rank":{let a=e[i].dims.length;r.push(`${n};${a}`);break}case"dims":{let a=e[i].dims.join(",");r.push(`${n};${a}`);break}default:throw new Error(`unsupported input dependency: ${t[i]}`)}}return r.join("|")},Lp=(e,t,r)=>{let i=e.name;return e.shaderCache?.hint&&(i+="["+e.shaderCache.hint+"]"),i+=":"+r+`:${Pp(t,e.shaderCache?.inputDependencies??new Array(t.length).fill("dims"))}`,i},Up=class{constructor(e){e&&(this.architecture=e.architecture,this.vendor=e.vendor)}isArchitecture(e){return this.architecture===e}isVendor(e){return this.vendor===e}},_m=class{constructor(){this.currentSessionId=null,this.currentKernelId=null,this.commandEncoder=null,this.computePassEncoder=null,this.maxDispatchNumber=16,this.pendingDispatchNumber=0,this.pendingKernels=[],this.pendingQueries=new Map,this.sessionStatus="default",this.capturedCommandList=new Map,this.capturedPendingKernels=new Map,this.sessionExternalDataMapping=new Map}get currentKernelCustomData(){if(this.currentKernelId===null)throw new Error("currentKernelCustomData(): currentKernelId is null. (should not happen)");let e=this.kernelCustomData.get(this.currentKernelId);return e||(e={},this.kernelCustomData.set(this.currentKernelId,e)),e}async initialize(e,t){this.env=e;let r=[],i={requiredLimits:{maxComputeWorkgroupStorageSize:t.limits.maxComputeWorkgroupStorageSize,maxComputeWorkgroupsPerDimension:t.limits.maxComputeWorkgroupsPerDimension,maxStorageBufferBindingSize:t.limits.maxStorageBufferBindingSize,maxBufferSize:t.limits.maxBufferSize,maxComputeInvocationsPerWorkgroup:t.limits.maxComputeInvocationsPerWorkgroup,maxComputeWorkgroupSizeX:t.limits.maxComputeWorkgroupSizeX,maxComputeWorkgroupSizeY:t.limits.maxComputeWorkgroupSizeY,maxComputeWorkgroupSizeZ:t.limits.maxComputeWorkgroupSizeZ},requiredFeatures:r},n=o=>t.features.has(o)&&r.push(o)&&!0;n("chromium-experimental-timestamp-query-inside-passes")||n("timestamp-query"),n("shader-f16"),n("subgroups"),this.device=await t.requestDevice(i);let a=t,s=t.info??(typeof a.requestAdapterInfo=="function"?await a.requestAdapterInfo():void 0);this.adapterInfo=new Up(s),this.gpuDataManager=Ic(this),this.programManager=new mm(this),this.kernels=new Map,this.kernelPersistentData=new Map,this.kernelCustomData=new Map,za(e.logLevel,!!e.debug),this.device.onuncapturederror=o=>{o.error instanceof GPUValidationError&&console.error(`An uncaught WebGPU validation error was raised: ${o.error.message}`)},Object.defineProperty(this.env.webgpu,"device",{value:this.device,writable:!1,enumerable:!0,configurable:!0}),Object.defineProperty(this.env.webgpu,"adapter",{value:t,writable:!1,enumerable:!0,configurable:!1}),this.setQueryType()}dispose(){typeof this.querySet<"u"&&this.querySet.destroy(),this.gpuDataManager.dispose(),this.device&&this.env?.webgpu&&this.device.lost.then(()=>{delete this.env.webgpu.device})}getCommandEncoder(){return this.commandEncoder||(this.commandEncoder=this.device.createCommandEncoder()),this.commandEncoder}getComputePassEncoder(){if(!this.computePassEncoder){let e=this.getCommandEncoder(),t={};this.queryType==="at-passes"&&(t.timestampWrites={querySet:this.querySet,beginningOfPassWriteIndex:this.pendingDispatchNumber*2,endOfPassWriteIndex:this.pendingDispatchNumber*2+1}),this.computePassEncoder=e.beginComputePass(t)}return this.computePassEncoder}endComputePass(){this.computePassEncoder&&(this.computePassEncoder.end(),this.computePassEncoder=null)}flush(){if(!this.commandEncoder)return;et(),this.endComputePass();let e;this.queryType!=="none"&&(this.commandEncoder.resolveQuerySet(this.querySet,0,this.pendingDispatchNumber*2,this.queryResolveBuffer,0),e=this.device.createBuffer({size:this.pendingDispatchNumber*2*8,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.pendingQueries.set(e,this.pendingKernels),this.pendingKernels=[],this.commandEncoder.copyBufferToBuffer(this.queryResolveBuffer,0,e,0,this.pendingDispatchNumber*2*8)),this.device.queue.submit([this.commandEncoder.finish()]),this.gpuDataManager.refreshPendingBuffers(),this.commandEncoder=null,this.pendingDispatchNumber=0,this.queryType!=="none"&&e.mapAsync(GPUMapMode.READ).then(()=>{let t=new BigUint64Array(e.getMappedRange()),r=this.pendingQueries.get(e);for(let i=0;i<t.length/2;i++){let n=r[i],a=n.kernelId,s=this.kernels.get(a),o=s.kernelType,l=s.kernelName,d=n.programName,h=n.inputTensorViews,c=n.outputTensorViews,f=t[i*2],y=t[i*2+1];typeof this.queryTimeBase>"u"&&(this.queryTimeBase=f);let _=Number(f-this.queryTimeBase),w=Number(y-this.queryTimeBase);if(!Number.isSafeInteger(_)||!Number.isSafeInteger(w))throw new RangeError("incorrect timestamp range");if(this.env.webgpu.profiling?.ondata)this.env.webgpu.profiling.ondata({version:1,inputsMetadata:h.map(S=>({dims:S.dims,dataType:lt(S.dataType)})),outputsMetadata:c.map(S=>({dims:S.dims,dataType:lt(S.dataType)})),kernelId:a,kernelType:o,kernelName:l,programName:d,startTime:_,endTime:w});else{let S="";h.forEach((b,T)=>{S+=`input[${T}]: [${b.dims}] | ${lt(b.dataType)}, `});let v="";c.forEach((b,T)=>{v+=`output[${T}]: [${b.dims}] | ${lt(b.dataType)}, `}),console.log(`[profiling] kernel "${a}|${o}|${l}|${d}" ${S}${v}start time: ${_} ns, execution time: ${w-_} ns`)}Cr("GPU",`${d}::${f}::${y}`)}e.unmap(),this.pendingQueries.delete(e)}),Ve()}run(e,t,r,i,n,a){et(e.name);let s=[];for(let b=0;b<t.length;++b){let T=t[b].data;if(T===0)continue;let E=this.gpuDataManager.get(T);if(!E)throw new Error(`no GPU data for input: ${T}`);s.push(E)}let{outputs:o,dispatchGroup:l,programUniforms:d}=e.getRunData(t),h=r.length===0?o.map((b,T)=>T):r;if(h.length!==o.length)throw new Error(`Output size ${h.length} must be equal to ${o.length}.`);let c=[],f=[];for(let b=0;b<o.length;++b){if(!Number.isInteger(h[b])||h[b]<-3||h[b]>=a)throw new Error(`Invalid output index: ${h[b]}`);if(h[b]===-3)continue;let T=h[b]===-1,E=h[b]===-2,I=T||E?n(o[b].dataType,o[b].dims):i(h[b],o[b].dataType,o[b].dims);if(c.push(I),I.data===0)continue;let C=this.gpuDataManager.get(I.data);if(!C)throw new Error(`no GPU data for output: ${I.data}`);if(T&&this.temporaryData.push(C),E){let z=this.kernelPersistentData.get(this.currentKernelId);z||(z=[],this.kernelPersistentData.set(this.currentKernelId,z)),z.push(C)}f.push(C)}if(s.length!==t.length||f.length!==c.length){if(f.length===0)return Ve(e.name),c;throw new Error(`Program ${e.name} has zero-sized tensor(s) in inputs or outputs. This is not supported now.`)}let y;if(d){let b=0,T=[];d.forEach(z=>{let $=typeof z.data=="number"?[z.data]:z.data;if($.length===0)return;let B=z.type===10?2:4,W,F;z.type===10?(F=$.length>4?16:$.length>2?8:$.length*B,W=$.length>4?16:B*$.length):(F=$.length<=2?$.length*B:16,W=16),b=Math.ceil(b/F)*F,T.push(b);let q=z.type===10?8:4;b+=$.length>4?Math.ceil($.length/q)*W:$.length*B});let E=16;b=Math.ceil(b/E)*E;let I=new ArrayBuffer(b);d.forEach((z,$)=>{let B=T[$],W=typeof z.data=="number"?[z.data]:z.data;if(z.type===6)new Int32Array(I,B,W.length).set(W);else if(z.type===12)new Uint32Array(I,B,W.length).set(W);else if(z.type===10)new Uint16Array(I,B,W.length).set(W);else if(z.type===1)new Float32Array(I,B,W.length).set(W);else throw new Error(`Unsupported uniform type: ${lt(z.type)}`)});let C=this.gpuDataManager.create(b,GPUBufferUsage.COPY_DST|GPUBufferUsage.UNIFORM);this.device.queue.writeBuffer(C.buffer,0,I,0,b),this.gpuDataManager.release(C.id),y={offset:0,size:b,buffer:C.buffer}}let _=this.programManager.normalizeDispatchGroupSize(l),w=_[1]===1&&_[2]===1,S=Lp(e,t,w),v=this.programManager.getArtifact(S);if(v||(v=this.programManager.build(e,_),this.programManager.setArtifact(S,v),pe("info",()=>`[artifact] key: ${S}, programName: ${e.name}`)),d&&v.uniformVariablesInfo){if(d.length!==v.uniformVariablesInfo.length)throw new Error(`Uniform variables count mismatch: expect ${v.uniformVariablesInfo.length}, got ${d.length} in program "${v.programInfo.name}".`);for(let b=0;b<d.length;b++){let T=d[b],E=T.type,I=typeof T.data=="number"?1:T.data.length,[C,z]=v.uniformVariablesInfo[b];if(E!==C||I!==z)throw new Error(`Uniform variable ${b} mismatch: expect type ${C} with size ${z}, got type ${E} with size ${I} in program "${v.programInfo.name}".`)}}if(pe("info",()=>`[ProgramManager] run "${e.name}" (key=${S}) with ${_[0]}x${_[1]}x${_[2]}`),this.queryType!=="none"||this.sessionStatus==="capturing"){let b={kernelId:this.currentKernelId,programName:v.programInfo.name,inputTensorViews:t,outputTensorViews:c};this.pendingKernels.push(b),this.sessionStatus==="capturing"&&this.capturedPendingKernels.get(this.currentSessionId).push(b)}return this.programManager.run(v,s,f,_,y),Ve(e.name),c}upload(e,t){this.gpuDataManager.upload(e,t)}memcpy(e,t){this.gpuDataManager.memcpy(e,t)}async download(e,t){await this.gpuDataManager.download(e,t)}alloc(e){return this.gpuDataManager.create(e).id}free(e){return this.gpuDataManager.release(e)}createKernel(e,t,r,i){let n=fm.get(e);if(!n)throw new Error(`kernel not implemented: ${e}`);let a={kernelType:e,kernelName:i,kernelEntry:n[0],attributes:[n[1],r]};this.kernels.set(t,a)}releaseKernel(e){let t=this.kernelPersistentData.get(e);if(t){for(let r of t)this.gpuDataManager.release(r.id);this.kernelPersistentData.delete(e)}this.kernelCustomData.delete(e),this.kernels.delete(e)}computeKernel(e,t,r){let i=this.kernels.get(e);if(!i)throw new Error(`kernel not created: ${e}`);let n=i.kernelType,a=i.kernelName,s=i.kernelEntry,o=i.attributes;if(this.currentKernelId!==null)throw new Error(`kernel "[${n}] ${a}" is not allowed to be called recursively`);this.currentKernelId=e,o[0]&&(o[1]=o[0](o[1]),o[0]=void 0),pe("info",()=>`[WebGPU] Start to run kernel "[${n}] ${a}"...`);let l=this.env.debug;this.temporaryData=[];try{return l&&this.device.pushErrorScope("validation"),s(t,o[1]),0}catch(d){return r.push(Promise.resolve(`[WebGPU] Kernel "[${n}] ${a}" failed. ${d}`)),1}finally{l&&r.push(this.device.popErrorScope().then(d=>d?`GPU validation error for kernel "[${n}] ${a}": ${d.message}`:null));for(let d of this.temporaryData)this.gpuDataManager.release(d.id);this.temporaryData=[],this.currentKernelId=null}}registerBuffer(e,t,r,i){let n=this.sessionExternalDataMapping.get(e);n||(n=new Map,this.sessionExternalDataMapping.set(e,n));let a=n.get(t),s=this.gpuDataManager.registerExternalBuffer(r,i,a);return n.set(t,[s,r]),s}unregisterBuffers(e){let t=this.sessionExternalDataMapping.get(e);t&&(t.forEach(r=>this.gpuDataManager.unregisterExternalBuffer(r[0])),this.sessionExternalDataMapping.delete(e))}getBuffer(e){let t=this.gpuDataManager.get(e);if(!t)throw new Error(`no GPU data for buffer: ${e}`);return t.buffer}createDownloader(e,t,r){return async()=>{let i=await oa(this,e,t);return Oa(i.buffer,r)}}writeTimestamp(e){this.queryType==="inside-passes"&&this.computePassEncoder.writeTimestamp(this.querySet,e)}setQueryType(){this.queryType="none",(this.env.webgpu.profiling?.mode==="default"||(typeof this.env.trace>"u"?this.env.wasm.trace:this.env.trace))&&(this.device.features.has("chromium-experimental-timestamp-query-inside-passes")?this.queryType="inside-passes":this.device.features.has("timestamp-query")&&(this.queryType="at-passes"),this.queryType!=="none"&&typeof this.querySet>"u"&&(this.querySet=this.device.createQuerySet({type:"timestamp",count:this.maxDispatchNumber*2}),this.queryResolveBuffer=this.device.createBuffer({size:this.maxDispatchNumber*2*8,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.QUERY_RESOLVE})))}captureBegin(){pe("info","captureBegin"),this.capturedCommandList.get(this.currentSessionId)||this.capturedCommandList.set(this.currentSessionId,[]),this.capturedPendingKernels.get(this.currentSessionId)||this.capturedPendingKernels.set(this.currentSessionId,[]),this.flush(),this.sessionStatus="capturing"}captureEnd(){pe("info","captureEnd"),this.flush(),this.sessionStatus="default"}replay(){pe("info","replay"),this.sessionStatus="replaying";let e=this.capturedCommandList.get(this.currentSessionId),t=this.capturedPendingKernels.get(this.currentSessionId),r=e.length;this.pendingKernels=[];for(let i=0;i<r;i++){let n=this.getComputePassEncoder(),a=e[i];this.writeTimestamp(this.pendingDispatchNumber*2),n.setPipeline(a.computePipeline),n.setBindGroup(0,a.bindGroup),n.dispatchWorkgroups(...a.dispatchGroup),this.writeTimestamp(this.pendingDispatchNumber*2+1),this.pendingDispatchNumber++,this.queryType!=="none"&&this.pendingKernels.push(t[i]),(this.pendingDispatchNumber>=this.maxDispatchNumber||this.queryType==="at-passes")&&this.endComputePass(),this.pendingDispatchNumber>=this.maxDispatchNumber&&this.flush()}this.flush(),this.sessionStatus="default"}onCreateSession(){this.gpuDataManager.onCreateSession()}onReleaseSession(e){this.unregisterBuffers(e),this.capturedCommandList.has(e)&&this.capturedCommandList.delete(e),this.capturedPendingKernels.has(e)&&this.capturedPendingKernels.delete(e),this.gpuDataManager.onReleaseSession(e)}onRunStart(e){this.currentSessionId=e,this.setQueryType()}}}),ym={};er(ym,{init:()=>bm});var si,Wp,bm,db=L(()=>{"use strict";te(),dt(),ne(),_y(),si=class wm{constructor(t,r,i,n){this.module=t,this.dataType=r,this.data=i,this.dims=n}getFloat32Array(){if(this.dataType!==1)throw new Error("Invalid data type");let t=R.size(this.dims);return t===0?new Float32Array:new Float32Array(this.module.HEAP8.buffer,this.data,t)}getBigInt64Array(){if(this.dataType!==7)throw new Error("Invalid data type");let t=R.size(this.dims);return t===0?new BigInt64Array:new BigInt64Array(this.module.HEAP8.buffer,this.data,t)}getInt32Array(){if(this.dataType!==6)throw new Error("Invalid data type");let t=R.size(this.dims);return t===0?new Int32Array:new Int32Array(this.module.HEAP8.buffer,this.data,t)}getUint16Array(){if(this.dataType!==10&&this.dataType!==4)throw new Error("Invalid data type");let t=R.size(this.dims);return t===0?new Uint16Array:new Uint16Array(this.module.HEAP8.buffer,this.data,t)}reshape(t){if(R.size(t)!==R.size(this.dims))throw new Error("Invalid new shape");return new wm(this.module,this.dataType,this.data,t)}},Wp=class{constructor(e,t,r){this.module=e,this.backend=t,this.customDataOffset=0,this.customDataSize=0,this.adapterInfo=t.adapterInfo;let i=e.PTR_SIZE,n=r/e.PTR_SIZE,a=i===4?"i32":"i64";this.opKernelContext=Number(e.getValue(i*n++,a));let s=Number(e.getValue(i*n++,a));this.outputCount=Number(e.getValue(i*n++,a)),this.customDataOffset=Number(e.getValue(i*n++,"*")),this.customDataSize=Number(e.getValue(i*n++,a));let o=[];for(let l=0;l<s;l++){let d=Number(e.getValue(i*n++,a)),h=Number(e.getValue(i*n++,"*")),c=Number(e.getValue(i*n++,a)),f=[];for(let y=0;y<c;y++)f.push(Number(e.getValue(i*n++,a)));o.push(new si(e,d,h,f))}this.inputs=o}get kernelCustomData(){return this.backend.currentKernelCustomData}get customDataBuffer(){return this.module.HEAPU8.subarray(this.customDataOffset,this.customDataOffset+this.customDataSize)}compute(e,t){let r=t?.inputs?.map(s=>typeof s=="number"?this.inputs[s]:s)??this.inputs,i=t?.outputs??[],n=(s,o,l)=>new si(this.module,o,this.output(s,l),l),a=(s,o)=>{let l=Ut(s,o);if(!l)throw new Error(`Unsupported data type: ${s}`);let d=l>0?this.backend.gpuDataManager.create(l).id:0;return new si(this.module,s,d,o)};return this.backend.run(e,r,i,n,a,this.outputCount)}output(e,t){let r=this.module.stackSave();try{let i=this.module.PTR_SIZE,n=i===4?"i32":"i64",a=this.module.stackAlloc((1+t.length)*i);this.module.setValue(a,t.length,n);for(let s=0;s<t.length;s++)this.module.setValue(a+i*(s+1),t[s],n);return this.module._JsepOutput(this.opKernelContext,e,a)}catch(i){throw new Error(`Failed to generate kernel's output[${e}] with dims [${t}]. If you are running with pre-allocated output, please make sure the output type/dims are correct. Error: ${i}`)}finally{this.module.stackRestore(r)}}},bm=async(e,t,r,i)=>{let n=t.jsepInit;if(!n)throw new Error("Failed to initialize JSEP. The WebAssembly module is not built with JSEP support.");if(e==="webgpu"){let a=(lb(),kr(gm)).WebGpuBackend,s=new a;await s.initialize(r,i),n("webgpu",[s,o=>s.alloc(Number(o)),o=>s.free(o),(o,l,d,h=!1)=>{if(h)pe("verbose",()=>`[WebGPU] jsepCopyGpuToGpu: src=${Number(o)}, dst=${Number(l)}, size=${Number(d)}`),s.memcpy(Number(o),Number(l));else{pe("verbose",()=>`[WebGPU] jsepCopyCpuToGpu: dataOffset=${Number(o)}, gpuDataId=${Number(l)}, size=${Number(d)}`);let c=t.HEAPU8.subarray(Number(o>>>0),Number(o>>>0)+Number(d));s.upload(Number(l),c)}},async(o,l,d)=>{pe("verbose",()=>`[WebGPU] jsepCopyGpuToCpu: gpuDataId=${o}, dataOffset=${l}, size=${d}`),await s.download(Number(o),()=>t.HEAPU8.subarray(Number(l)>>>0,Number(l+d)>>>0))},(o,l,d)=>s.createKernel(o,Number(l),d,t.UTF8ToString(t._JsepGetNodeName(Number(l)))),o=>s.releaseKernel(o),(o,l,d,h)=>{pe("verbose",()=>`[WebGPU] jsepRun: sessionHandle=${d}, kernel=${o}, contextDataOffset=${l}`);let c=new Wp(t,s,Number(l));return s.computeKernel(Number(o),c,h)},()=>s.captureBegin(),()=>s.captureEnd(),()=>s.replay()])}else{let a=new Ec(r);n("webnn",[a,()=>a.reserveTensorId(),s=>a.releaseTensorId(s),async(s,o,l,d,h)=>a.ensureTensor(s,o,l,d,h),(s,o)=>{a.uploadTensor(s,o)},async(s,o)=>a.downloadTensor(s,o),(s,o)=>a.registerMLContext(s,o),!!r.trace])}}}),qp,qa,Va,wt,Vp,ta,_i,Ga,Fa,ra,Ha,ja,Ka,vm=L(()=>{"use strict";Ge(),fy(),my(),te(),Ft(),Ea(),wc(),qp=(e,t)=>{be()._OrtInit(e,t)!==0&&me("Can't initialize onnxruntime.")},qa=async e=>{qp(e.wasm.numThreads,ci(e.logLevel))},Va=async(e,t)=>{be().asyncInit?.();let r=e.webgpu.adapter;if(t==="webgpu"){if(typeof navigator>"u"||!navigator.gpu)throw new Error("WebGPU is not supported in current environment");if(r){if(typeof r.limits!="object"||typeof r.features!="object"||typeof r.requestDevice!="function")throw new Error("Invalid GPU adapter set in `env.webgpu.adapter`. It must be a GPUAdapter object.")}else{let i=e.webgpu.powerPreference;if(i!==void 0&&i!=="low-power"&&i!=="high-performance")throw new Error(`Invalid powerPreference setting: "${i}"`);let n=e.webgpu.forceFallbackAdapter;if(n!==void 0&&typeof n!="boolean")throw new Error(`Invalid forceFallbackAdapter setting: "${n}"`);if(r=await navigator.gpu.requestAdapter({powerPreference:i,forceFallbackAdapter:n}),!r)throw new Error('Failed to get GPU adapter. You may need to enable flag "--enable-unsafe-webgpu" if you are using Chrome.')}}if(t==="webnn"&&(typeof navigator>"u"||!navigator.ml))throw new Error("WebNN is not supported in current environment");{let i=(db(),kr(ym)).init;t==="webgpu"&&await i("webgpu",be(),e,r),t==="webnn"&&await i("webnn",be(),e)}},wt=new Map,Vp=e=>{let t=be(),r=t.stackSave();try{let i=t.PTR_SIZE,n=t.stackAlloc(2*i);t._OrtGetInputOutputCount(e,n,n+i)!==0&&me("Can't get session input/output count.");let a=i===4?"i32":"i64";return[Number(t.getValue(n,a)),Number(t.getValue(n+i,a))]}finally{t.stackRestore(r)}},ta=(e,t)=>{let r=be(),i=r.stackSave(),n=0;try{let a=r.PTR_SIZE,s=r.stackAlloc(2*a);r._OrtGetInputOutputMetadata(e,t,s,s+a)!==0&&me("Can't get session input/output metadata.");let o=Number(r.getValue(s,"*"));n=Number(r.getValue(s+a,"*"));let l=r.HEAP32[n/4];if(l===0)return[o,0];let d=r.HEAPU32[n/4+1],h=[];for(let c=0;c<d;c++){let f=Number(r.getValue(n+8+c*a,"*"));h.push(f!==0?r.UTF8ToString(f):Number(r.getValue(n+8+(c+d)*a,"*")))}return[o,l,h]}finally{r.stackRestore(i),n!==0&&r._OrtFree(n)}},_i=e=>{let t=be(),r=t._malloc(e.byteLength);if(r===0)throw new Error(`Can't create a session. failed to allocate a buffer of size ${e.byteLength}.`);return t.HEAPU8.set(e,r),[r,e.byteLength]},Ga=async(e,t)=>{let r,i,n=be();Array.isArray(e)?[r,i]=e:e.buffer===n.HEAPU8.buffer?[r,i]=[e.byteOffset,e.byteLength]:[r,i]=_i(e);let a=0,s=0,o=0,l=[],d=[],h=[];try{if([s,l]=await bc(t),t?.externalData&&n.mountExternalData){let E=[];for(let I of t.externalData){let C=typeof I=="string"?I:I.path,z=typeof I=="string"?I:I.data;E.push(Ca(z).then($=>{n.mountExternalData(C,$)}))}await Promise.all(E)}for(let E of t?.executionProviders??[])if((typeof E=="string"?E:E.name)==="webnn"){if(n.shouldTransferToMLTensor=!1,typeof E!="string"){let I=E,C=I?.context,z=I?.gpuDevice,$=I?.deviceType,B=I?.powerPreference;C?n.currentContext=C:z?n.currentContext=await n.webnnCreateMLContext(z):n.currentContext=await n.webnnCreateMLContext({deviceType:$,powerPreference:B})}else n.currentContext=await n.webnnCreateMLContext();break}a=await n._OrtCreateSession(r,i,s),n.webgpuOnCreateSession?.(a),a===0&&me("Can't create a session."),n.jsepOnCreateSession?.(),n.currentContext&&(n.webnnRegisterMLContext(a,n.currentContext),n.currentContext=void 0,n.shouldTransferToMLTensor=!0);let[c,f]=Vp(a),y=!!t?.enableGraphCapture,_=[],w=[],S=[],v=[],b=[];for(let E=0;E<c;E++){let[I,C,z]=ta(a,E);I===0&&me("Can't get an input name."),d.push(I);let $=n.UTF8ToString(I);_.push($),S.push(C===0?{name:$,isTensor:!1}:{name:$,isTensor:!0,type:lt(C),shape:z})}for(let E=0;E<f;E++){let[I,C,z]=ta(a,E+c);I===0&&me("Can't get an output name."),h.push(I);let $=n.UTF8ToString(I);w.push($),v.push(C===0?{name:$,isTensor:!1}:{name:$,isTensor:!0,type:lt(C),shape:z});{if(y&&t?.preferredOutputLocation===void 0){b.push("gpu-buffer");continue}let B=typeof t?.preferredOutputLocation=="string"?t.preferredOutputLocation:t?.preferredOutputLocation?.[$]??"cpu",W=n.webnnIsGraphOutput;if(B==="cpu"&&W&&W(a,$)){b.push("ml-tensor-cpu-output");continue}if(B!=="cpu"&&B!=="cpu-pinned"&&B!=="gpu-buffer"&&B!=="ml-tensor")throw new Error(`Not supported preferred output location: ${B}.`);if(y&&B!=="gpu-buffer")throw new Error(`Not supported preferred output location: ${B}. Only 'gpu-buffer' location is supported when enableGraphCapture is true.`);b.push(B)}}let T=null;return b.some(E=>E==="gpu-buffer"||E==="ml-tensor"||E==="ml-tensor-cpu-output")&&(o=n._OrtCreateBinding(a),o===0&&me("Can't create IO binding."),T={handle:o,outputPreferredLocations:b,outputPreferredLocationsEncoded:b.map(E=>E==="ml-tensor-cpu-output"?"ml-tensor":E).map(E=>sa(E))}),wt.set(a,[a,d,h,T,y,!1]),[a,_,w,S,v]}catch(c){throw d.forEach(f=>n._OrtFree(f)),h.forEach(f=>n._OrtFree(f)),o!==0&&n._OrtReleaseBinding(o)!==0&&me("Can't release IO binding."),a!==0&&n._OrtReleaseSession(a)!==0&&me("Can't release session."),c}finally{n._free(r),s!==0&&n._OrtReleaseSessionOptions(s)!==0&&me("Can't release session options."),l.forEach(c=>n._free(c)),n.unmountExternalData?.()}},Fa=e=>{let t=be(),r=wt.get(e);if(!r)throw new Error(`cannot release session. invalid session id: ${e}`);let[i,n,a,s,o]=r;s&&(o&&t._OrtClearBoundOutputs(s.handle)!==0&&me("Can't clear bound outputs."),t._OrtReleaseBinding(s.handle)!==0&&me("Can't release IO binding.")),t.jsepOnReleaseSession?.(e),t.webnnOnReleaseSession?.(e),t.webgpuOnReleaseSession?.(e),n.forEach(l=>t._OrtFree(l)),a.forEach(l=>t._OrtFree(l)),t._OrtReleaseSession(i)!==0&&me("Can't release session."),wt.delete(e)},ra=async(e,t,r,i,n,a,s=!1)=>{if(!e){t.push(0);return}let o=be(),l=o.PTR_SIZE,d=e[0],h=e[1],c=e[3],f=c,y,_;if(d==="string"&&(c==="gpu-buffer"||c==="ml-tensor"))throw new Error("String tensor is not supported on GPU.");if(s&&c!=="gpu-buffer")throw new Error(`External buffer must be provided for input/output index ${a} when enableGraphCapture is true.`);if(c==="gpu-buffer"){let v=e[2].gpuBuffer;_=Ut(Lt(d),h);{let b=o.jsepRegisterBuffer;if(!b)throw new Error('Tensor location "gpu-buffer" is not supported without using WebGPU.');y=b(i,a,v,_)}}else if(c==="ml-tensor"){let v=e[2].mlTensor;_=Ut(Lt(d),h);let b=o.webnnRegisterMLTensor;if(!b)throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');y=b(i,v,Lt(d),h)}else{let v=e[2];if(Array.isArray(v)){_=l*v.length,y=o._malloc(_),r.push(y);for(let b=0;b<v.length;b++){if(typeof v[b]!="string")throw new TypeError(`tensor data at index ${b} is not a string`);o.setValue(y+b*l,Ye(v[b],r),"*")}}else{let b=o.webnnIsGraphInput,T=o.webnnIsGraphOutput;if(d!=="string"&&b&&T){let E=o.UTF8ToString(n);if(b(i,E)||T(i,E)){let I=Lt(d);_=Ut(I,h),f="ml-tensor";let C=o.webnnCreateTemporaryTensor,z=o.webnnUploadTensor;if(!C||!z)throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');let $=await C(i,I,h);z($,new Uint8Array(v.buffer,v.byteOffset,v.byteLength)),y=$}else _=v.byteLength,y=o._malloc(_),r.push(y),o.HEAPU8.set(new Uint8Array(v.buffer,v.byteOffset,_),y)}else _=v.byteLength,y=o._malloc(_),r.push(y),o.HEAPU8.set(new Uint8Array(v.buffer,v.byteOffset,_),y)}}let w=o.stackSave(),S=o.stackAlloc(4*h.length);try{h.forEach((b,T)=>o.setValue(S+T*l,b,l===4?"i32":"i64"));let v=o._OrtCreateTensor(Lt(d),y,_,S,h.length,sa(f));v===0&&me(`Can't create tensor for input/output. session=${i}, index=${a}.`),t.push(v)}finally{o.stackRestore(w)}},Ha=async(e,t,r,i,n,a)=>{let s=be(),o=s.PTR_SIZE,l=wt.get(e);if(!l)throw new Error(`cannot run inference. invalid session id: ${e}`);let d=l[0],h=l[1],c=l[2],f=l[3],y=l[4],_=l[5],w=t.length,S=i.length,v=0,b=[],T=[],E=[],I=[],C=[],z=s.stackSave(),$=s.stackAlloc(w*o),B=s.stackAlloc(w*o),W=s.stackAlloc(S*o),F=s.stackAlloc(S*o);try{[v,b]=yc(a),xt("wasm prepareInputOutputTensor");for(let O=0;O<w;O++)await ra(r[O],T,I,e,h[t[O]],t[O],y);for(let O=0;O<S;O++)await ra(n[O],E,I,e,c[i[O]],w+i[O],y);St("wasm prepareInputOutputTensor");for(let O=0;O<w;O++)s.setValue($+O*o,T[O],"*"),s.setValue(B+O*o,h[t[O]],"*");for(let O=0;O<S;O++)s.setValue(W+O*o,E[O],"*"),s.setValue(F+O*o,c[i[O]],"*");if(f&&!_){let{handle:O,outputPreferredLocations:U,outputPreferredLocationsEncoded:J}=f;if(h.length!==w)throw new Error(`input count from feeds (${w}) is expected to be always equal to model's input count (${h.length}).`);xt("wasm bindInputsOutputs");for(let re=0;re<w;re++){let X=t[re];await s._OrtBindInput(O,h[X],T[re])!==0&&me(`Can't bind input[${re}] for session=${e}.`)}for(let re=0;re<S;re++){let X=i[re];n[re]?.[3]?(C.push(E[re]),s._OrtBindOutput(O,c[X],E[re],0)!==0&&me(`Can't bind pre-allocated output[${re}] for session=${e}.`)):s._OrtBindOutput(O,c[X],0,J[X])!==0&&me(`Can't bind output[${re}] to ${U[re]} for session=${e}.`)}St("wasm bindInputsOutputs"),wt.set(e,[d,h,c,f,y,!0])}s.jsepOnRunStart?.(d),s.webnnOnRunStart?.(d);let q;f?q=await s._OrtRunWithBinding(d,f.handle,S,W,v):q=await s._OrtRun(d,B,$,w,F,S,W,v),q!==0&&me("failed to call OrtRun().");let P=[],K=[];xt("wasm ProcessOutputTensor");for(let O=0;O<S;O++){let U=Number(s.getValue(W+O*o,"*"));if(U===E[O]||C.includes(E[O])){P.push(n[O]),U!==E[O]&&s._OrtReleaseTensor(U)!==0&&me("Can't release tensor.");continue}let J=s.stackSave(),re=s.stackAlloc(4*o),X=!1,se,N=0;try{s._OrtGetTensorData(U,re,re+o,re+2*o,re+3*o)!==0&&me(`Can't access output tensor data on index ${O}.`);let ee=o===4?"i32":"i64",Y=Number(s.getValue(re,ee));N=s.getValue(re+o,"*");let j=s.getValue(re+o*2,"*"),ve=Number(s.getValue(re+o*3,ee)),De=[];for(let _e=0;_e<ve;_e++)De.push(Number(s.getValue(j+_e*o,ee)));s._OrtFree(j)!==0&&me("Can't free memory for tensor dims.");let Se=De.reduce((_e,Te)=>_e*Te,1);se=lt(Y);let Oe=f?.outputPreferredLocations[i[O]];if(se==="string"){if(Oe==="gpu-buffer"||Oe==="ml-tensor")throw new Error("String tensor is not supported on GPU.");let _e=[];for(let Te=0;Te<Se;Te++){let Ne=s.getValue(N+Te*o,"*"),kt=s.getValue(N+(Te+1)*o,"*"),Br=Te===Se-1?void 0:kt-Ne;_e.push(s.UTF8ToString(Ne,Br))}P.push([se,De,_e,"cpu"])}else if(Oe==="gpu-buffer"&&Se>0){let _e=s.jsepGetBuffer;if(!_e)throw new Error('preferredLocation "gpu-buffer" is not supported without using WebGPU.');let Te=_e(N),Ne=Ut(Y,Se);if(Ne===void 0||!Ia(se))throw new Error(`Unsupported data type: ${se}`);X=!0,P.push([se,De,{gpuBuffer:Te,download:s.jsepCreateDownloader(Te,Ne,se),dispose:()=>{s._OrtReleaseTensor(U)!==0&&me("Can't release tensor.")}},"gpu-buffer"])}else if(Oe==="ml-tensor"&&Se>0){let _e=s.webnnEnsureTensor,Te=s.webnnIsGraphInputOutputTypeSupported;if(!_e||!Te)throw new Error('preferredLocation "ml-tensor" is not supported without using WebNN.');if(Ut(Y,Se)===void 0||!ka(se))throw new Error(`Unsupported data type: ${se}`);if(!Te(e,se,!1))throw new Error(`preferredLocation "ml-tensor" for ${se} output is not supported by current WebNN Context.`);let Ne=await _e(e,N,Y,De,!1);X=!0,P.push([se,De,{mlTensor:Ne,download:s.webnnCreateMLTensorDownloader(N,se),dispose:()=>{s.webnnReleaseTensorId(N),s._OrtReleaseTensor(U)}},"ml-tensor"])}else if(Oe==="ml-tensor-cpu-output"&&Se>0){let _e=s.webnnCreateMLTensorDownloader(N,se)(),Te=P.length;X=!0,K.push((async()=>{let Ne=[Te,await _e];return s.webnnReleaseTensorId(N),s._OrtReleaseTensor(U),Ne})()),P.push([se,De,[],"cpu"])}else{let _e=yi(se),Te=new _e(Se);new Uint8Array(Te.buffer,Te.byteOffset,Te.byteLength).set(s.HEAPU8.subarray(N,N+Te.byteLength)),P.push([se,De,Te,"cpu"])}}finally{s.stackRestore(J),se==="string"&&N&&s._free(N),X||s._OrtReleaseTensor(U)}}f&&!y&&(s._OrtClearBoundOutputs(f.handle)!==0&&me("Can't clear bound outputs."),wt.set(e,[d,h,c,f,y,!1]));for(let[O,U]of await Promise.all(K))P[O][2]=U;return St("wasm ProcessOutputTensor"),P}finally{s.webnnOnRunEnd?.(d),s.stackRestore(z),T.forEach(q=>s._OrtReleaseTensor(q)),E.forEach(q=>s._OrtReleaseTensor(q)),I.forEach(q=>s._free(q)),v!==0&&s._OrtReleaseRunOptions(v),b.forEach(q=>s._free(q))}},ja=e=>{let t=be(),r=wt.get(e);if(!r)throw new Error("invalid session id");let i=r[0],n=t._OrtEndProfiling(i);n===0&&me("Can't get an profile file name."),t._OrtFree(n)},Ka=e=>{let t=[];for(let r of e){let i=r[2];!Array.isArray(i)&&"buffer"in i&&t.push(i.buffer)}return t}}),vt,qe,Zt,$r,xr,oi,ia,ui,Bt,Nt,Gp,$m,xm,Sm,Tm,Em,Im,km,Cm=L(()=>{"use strict";Ge(),vm(),Ft(),Sa(),vt=()=>!!ge.wasm.proxy&&typeof document<"u",Zt=!1,$r=!1,xr=!1,ui=new Map,Bt=(e,t)=>{let r=ui.get(e);r?r.push(t):ui.set(e,[t])},Nt=()=>{if(Zt||!$r||xr||!qe)throw new Error("worker not ready")},Gp=e=>{switch(e.data.type){case"init-wasm":Zt=!1,e.data.err?(xr=!0,ia[1](e.data.err)):($r=!0,ia[0]()),oi&&(URL.revokeObjectURL(oi),oi=void 0);break;case"init-ep":case"copy-from":case"create":case"release":case"run":case"end-profiling":{let t=ui.get(e.data.type);e.data.err?t.shift()[1](e.data.err):t.shift()[0](e.data.out);break}default:}},$m=async()=>{if(!$r){if(Zt)throw new Error("multiple calls to 'initWasm()' detected.");if(xr)throw new Error("previous call to 'initWasm()' failed.");if(Zt=!0,vt())return new Promise((e,t)=>{qe?.terminate(),gc().then(([r,i])=>{try{qe=i,qe.onerror=a=>t(a),qe.onmessage=Gp,ia=[e,t];let n={type:"init-wasm",in:ge};!n.in.wasm.wasmPaths&&(r||aa)&&(n.in.wasm.wasmPaths={wasm:new URL("ort-wasm-simd-threaded.jsep.wasm",Qe.url).href}),qe.postMessage(n),oi=r}catch(n){t(n)}},t)});try{await Ta(ge.wasm),await qa(ge),$r=!0}catch(e){throw xr=!0,e}finally{Zt=!1}}},xm=async e=>{if(vt())return Nt(),new Promise((t,r)=>{Bt("init-ep",[t,r]);let i={type:"init-ep",in:{epName:e,env:ge}};qe.postMessage(i)});await Va(ge,e)},Sm=async e=>vt()?(Nt(),new Promise((t,r)=>{Bt("copy-from",[t,r]);let i={type:"copy-from",in:{buffer:e}};qe.postMessage(i,[e.buffer])})):_i(e),Tm=async(e,t)=>{if(vt()){if(t?.preferredOutputLocation)throw new Error('session option "preferredOutputLocation" is not supported for proxy.');return Nt(),new Promise((r,i)=>{Bt("create",[r,i]);let n={type:"create",in:{model:e,options:{...t}}},a=[];e instanceof Uint8Array&&a.push(e.buffer),qe.postMessage(n,a)})}else return Ga(e,t)},Em=async e=>{if(vt())return Nt(),new Promise((t,r)=>{Bt("release",[t,r]);let i={type:"release",in:e};qe.postMessage(i)});Fa(e)},Im=async(e,t,r,i,n,a)=>{if(vt()){if(r.some(s=>s[3]!=="cpu"))throw new Error("input tensor on GPU is not supported for proxy.");if(n.some(s=>s))throw new Error("pre-allocated output tensor is not supported for proxy.");return Nt(),new Promise((s,o)=>{Bt("run",[s,o]);let l=r,d={type:"run",in:{sessionId:e,inputIndices:t,inputs:l,outputIndices:i,options:a}};qe.postMessage(d,Ka(l))})}else return Ha(e,t,r,i,n,a)},km=async e=>{if(vt())return Nt(),new Promise((t,r)=>{Bt("end-profiling",[t,r]);let i={type:"end-profiling",in:e};qe.postMessage(i)});ja(e)}}),na,Fp,zm,pb=L(()=>{"use strict";Ge(),Cm(),te(),xa(),wc(),na=(e,t)=>{switch(e.location){case"cpu":return[e.type,e.dims,e.data,"cpu"];case"gpu-buffer":return[e.type,e.dims,{gpuBuffer:e.gpuBuffer},"gpu-buffer"];case"ml-tensor":return[e.type,e.dims,{mlTensor:e.mlTensor},"ml-tensor"];default:throw new Error(`invalid data location: ${e.location} for ${t()}`)}},Fp=e=>{switch(e[3]){case"cpu":return new Je(e[0],e[2],e[1]);case"gpu-buffer":{let t=e[0];if(!Ia(t))throw new Error(`not supported data type: ${t} for deserializing GPU tensor`);let{gpuBuffer:r,download:i,dispose:n}=e[2];return Je.fromGpuBuffer(r,{dataType:t,dims:e[1],download:i,dispose:n})}case"ml-tensor":{let t=e[0];if(!ka(t))throw new Error(`not supported data type: ${t} for deserializing MLTensor tensor`);let{mlTensor:r,download:i,dispose:n}=e[2];return Je.fromMLTensor(r,{dataType:t,dims:e[1],download:i,dispose:n})}default:throw new Error(`invalid data location: ${e[3]}`)}},zm=class{async fetchModelAndCopyToWasmMemory(e){return Sm(await Ca(e))}async loadModel(e,t){et();let r;typeof e=="string"?r=await this.fetchModelAndCopyToWasmMemory(e):r=e,[this.sessionId,this.inputNames,this.outputNames,this.inputMetadata,this.outputMetadata]=await Tm(r,t),Ve()}async dispose(){return Em(this.sessionId)}async run(e,t,r){et();let i=[],n=[];Object.entries(e).forEach(c=>{let f=c[0],y=c[1],_=this.inputNames.indexOf(f);if(_===-1)throw new Error(`invalid input '${f}'`);i.push(y),n.push(_)});let a=[],s=[];Object.entries(t).forEach(c=>{let f=c[0],y=c[1],_=this.outputNames.indexOf(f);if(_===-1)throw new Error(`invalid output '${f}'`);a.push(y),s.push(_)});let o=i.map((c,f)=>na(c,()=>`input "${this.inputNames[n[f]]}"`)),l=a.map((c,f)=>c?na(c,()=>`output "${this.outputNames[s[f]]}"`):null),d=await Im(this.sessionId,n,o,s,l,r),h={};for(let c=0;c<d.length;c++)h[this.outputNames[s[c]]]=a[c]??Fp(d[c]);return Ve(),h}startProfiling(){}endProfiling(){km(this.sessionId)}}}),Om={};er(Om,{OnnxruntimeWebAssemblyBackend:()=>ba,initializeFlags:()=>ya,wasmBackend:()=>Am});var ya,ba,Am,cb=L(()=>{"use strict";Ge(),Cm(),pb(),ya=()=>{(typeof ge.wasm.initTimeout!="number"||ge.wasm.initTimeout<0)&&(ge.wasm.initTimeout=0);let e=ge.wasm.simd;if(typeof e!="boolean"&&e!==void 0&&e!=="fixed"&&e!=="relaxed"&&(console.warn(`Property "env.wasm.simd" is set to unknown value "${e}". Reset it to \`false\` and ignore SIMD feature checking.`),ge.wasm.simd=!1),typeof ge.wasm.proxy!="boolean"&&(ge.wasm.proxy=!1),typeof ge.wasm.trace!="boolean"&&(ge.wasm.trace=!1),typeof ge.wasm.numThreads!="number"||!Number.isInteger(ge.wasm.numThreads)||ge.wasm.numThreads<=0)if(typeof self<"u"&&!self.crossOriginIsolated)ge.wasm.numThreads=1;else{let t=typeof navigator>"u"?Y_("node:os").cpus().length:navigator.hardwareConcurrency;ge.wasm.numThreads=Math.min(4,Math.ceil((t||1)/2))}},ba=class{async init(e){ya(),await $m(),await xm(e)}async createInferenceSessionHandler(e,t){let r=new zm;return await r.loadModel(e,t),r}},Am=new ba});Ge();Ge();Ge();var hb="1.29.0",fb=dc;{let e=(cb(),kr(Om)).wasmBackend;Wt("webgpu",e,5),Wt("webnn",e,5),Wt("cpu",e,10),Wt("wasm",e,10)}Object.defineProperty(ge.versions,"web",{value:hb,enumerable:!0});var tr={verbose:!1,debug:!1,debugFolder:"out"},bi={mean:[.485,.456,.406],stdDeviation:[.229,.224,.225],maxSideLength:"auto",minimumAreaThreshold:20,paddingVertical:.4,paddingHorizontal:.6},wi={imageHeight:48,strategy:"per-line",crossLineWidthFactor:1,minimumConfidence:.5,charactersDictionary:[],maxCropSourceSideLength:2e3,mainThreadYieldMs:0,recBatchSize:6,rotateVerticalCrops:!0,spaceRecovery:!1},Rm=10,mb={executionProviders:["cpu"],graphOptimizationLevel:"all",enableCpuMemArena:!0,enableMemPattern:!0,executionMode:"sequential",interOpNumThreads:0,intraOpNumThreads:0},vi="opencv",Dm={engine:vi},Or={model:{},detection:bi,recognition:wi,debugging:tr,session:mb,processing:Dm};function xi(e,...t){if(!t.length)return e;let r=t.shift();if($i(e)&&$i(r)){for(let i in r)if(Object.prototype.hasOwnProperty.call(r,i)){if(i==="__proto__"||i==="constructor"||i==="prototype")continue;let n=r[i],a=e[i];$i(n)?((!a||!$i(a))&&(e[i]={}),xi(e[i],n)):n!==void 0&&(e[i]=n)}}return xi(e,...t)}async function Mm(e,t={}){let{timeoutMs:r=3e5,retries:i=2}=t,n;for(let a=0;a<=i;a++)try{let s=await fetch(e,{signal:AbortSignal.timeout(r),referrerPolicy:"no-referrer"});if(!s.ok)throw new Error(`HTTP ${s.status} ${s.statusText}`);return await s.arrayBuffer()}catch(s){n=s,a<i&&await new Promise(o=>setTimeout(o,500*(a+1)))}throw new Error(`Failed to fetch ${e} after ${i+1} attempt(s): ${String(n)}`)}function Ar(e){return(typeof e=="string"?e:new TextDecoder("utf-8").decode(e)).split(/\r?\n/)}function $i(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)&&!(e instanceof Date)&&!(e instanceof RegExp)&&!(e instanceof ArrayBuffer)&&!ArrayBuffer.isView(e)}function Bm(e,t){return e!=="auto"?e:Math.min(1920,Math.max(960,Math.round(t*.75/32)*32))}function Si(e,t,r){let i=e,n=t,a=1;return Math.max(n,i)>r&&(a=r/(n>i?n:i),i=Math.round(i*a),n=Math.round(n*a)),{width:i,height:n,ratio:a}}function gb(e,t,r,i,n){let a=Math.round(e.height*i),s=Math.round(e.height*n),o=e.x-s,l=e.y-a;o=Math.max(0,o),l=Math.max(0,l);let d=Math.min(t,e.x+e.width+s),h=Math.min(r,e.y+e.height+a),c=d-o,f=h-l;return{x:o,y:l,width:c,height:f}}function _b(e,t,r,i){let n=e.x/t,a=e.y/t,s=e.width/t,o=e.height/t,l=Math.max(0,Math.round(n)),d=Math.max(0,Math.round(a)),h=Math.min(r-l,Math.round(s)),c=Math.min(i-d,Math.round(o));return{x:l,y:d,width:h,height:c}}function Nm(e,t,r,i,n,a,s,o,l){let d=[];return e.iterate(h=>{let c=e.getRect(h);if(c.width*c.height<=s)return;let f=gb(c,t,r,o,l),y=_b(f,i,n,a);y.width>5&&y.height>5&&d.push(y)}),d}function Pm(e,t,r){let i=[];for(let n of e){let{bbox:a}=n,s={x:Math.max(0,a.x0),y:Math.max(0,a.y0),width:a.x1-a.x0,height:a.y1-a.y0};s.x+s.width>t&&(s.width=t-s.x),s.y+s.height>r&&(s.height=r-s.y),s.width>5&&s.height>5&&i.push(s)}return i}var yb=3;function Lm(e,t,r,i,n){let o=e.getContext("2d").getImageData(0,0,t,r).data,l=r*t,d=new Float32Array(yb*l),h=i[0]??.485,c=i[1]??.456,f=i[2]??.406,y=n[0]??.229,_=n[1]??.224,w=n[2]??.225,S=1/(255*y),v=1/(255*_),b=1/(255*w),T=h/y,E=c/_,I=f/w,C=l,z=l*2;for(let $=0,B=0;$<l;$++,B+=4){let W=o[B],F=o[B+1],q=o[B+2];d[$]=W*S-T,d[C+$]=F*v-E,d[z+$]=q*b-I}return d}function Xa(e,t,r,i){let n=i(t,r),a=n.getContext("2d"),s=a.createImageData(t,r),o=s.data,l=t*r;for(let d=0;d<l;d++){let h=e[d]||0,c=Math.round(h*255),f=d*4;o[f]=c,o[f+1]=c,o[f+2]=c,o[f+3]=255}return a.putImageData(s,0,0),n}var rr=class{options;debugging;session;platform;engine;lastDetectionCanvas=null;constructor(t,r,i={},n={},a="opencv"){this.platform=t,this.session=r,this.options={...bi,...i},this.debugging={...tr,...n},a==="opencv"&&!this.platform.imageProcessor?this.engine="canvas-native":this.engine=a}log(t){this.debugging.verbose&&console.log(`[DetectionService] ${t}`)}async run(t){this.log("Starting text detection process");try{let r;this.platform.isCanvas(t)?r=t:this.engine==="opencv"&&this.platform.imageProcessor?r=await this.platform.imageProcessor.prepareCanvas(t):r=await this.platform.canvas.prepareCanvas(t);let i=await this.preprocessDetection(r),n=await this.runInference(i.tensor,i.width,i.height);if(!n)return console.error("Text detection failed (output tensor is null)"),[];let a=this.postprocessDetection(n,i);if(this.debugging.debug&&this.debugging.debugFolder&&this.lastDetectionCanvas)try{await this.debugDetectionCanvas(this.lastDetectionCanvas,i.width,i.height),await this.debugDetectedBoxes(r,a)}catch(s){this.log(`Debug dump failed: ${s instanceof Error?s.message:String(s)}`)}return this.log(`Detected ${a.length} text boxes in image`),a}catch(r){return console.error("Error during text detection:",r instanceof Error?r.message:String(r)),[]}}async preprocessDetection(t){let{width:r,height:i}=t,n=Bm(this.options.maxSideLength??"auto",Math.max(r,i)),{width:a,height:s,ratio:o}=Si(r,i,n),l=Math.ceil(a/32)*32,d=Math.ceil(s/32)*32,h=this.platform.createCanvas(l,d);h.getContext("2d").drawImage(t,0,0,r,i,0,0,a,s);let f=this.options.mean??[.485,.456,.406],y=this.options.stdDeviation??[.229,.224,.225],_=Lm(h,l,d,f,y);return this.log(`Detection preprocessed: original(${r}x${i}), model_input(${l}x${d}), resize_ratio: ${o.toFixed(4)}, engine: ${this.engine}`),{tensor:_,width:l,height:d,resizeRatio:o,originalWidth:r,originalHeight:i}}async runInference(t,r,i){let n;try{this.log("Running detection inference..."),n=new this.platform.ort.Tensor("float32",t,[1,3,i,r]);let a={x:n},o=(await this.session.run(a))[this.session.outputNames[0]||"sigmoid_0.tmp_0"];return this.log("Detection inference complete!"),o?o.data:(console.error(`Output tensor ${this.session.outputNames[0]} not found in detection results`),null)}catch(a){throw console.error("Error during model inference:",a instanceof Error?a.message:String(a)),a}finally{n?.dispose()}}postprocessDetection(t,r,i=this.options.minimumAreaThreshold??50,n=this.options.paddingVertical||.4,a=this.options.paddingHorizontal||.6){this.log("Post-processing detection results...");let{width:s,height:o,resizeRatio:l,originalWidth:d,originalHeight:h}=r;if(this.engine==="opencv"&&this.platform.imageProcessor)return this.lastDetectionCanvas=this.debugging.debug&&this.debugging.debugFolder?Xa(t,s,o,this.platform.createCanvas.bind(this.platform)):null,this.postprocessWithOpenCV(t,s,o,l,d,h,i,n,a);let c=Xa(t,s,o,this.platform.createCanvas.bind(this.platform));return this.lastDetectionCanvas=c,this.postprocessWithCanvasNative(c,l,d,h,i,n,a)}postprocessWithOpenCV(t,r,i,n,a,s,o,l,d){let h=this.platform.imageProcessor,c=new h.cv.Mat(i,r,h.cv.CV_8UC1),f=c.data,y=r*i;for(let w=0;w<y;w++){let S=t[w]||0;f[w]=Math.round(Math.min(Math.max(S,0),1)*255)}let _=new h.ImageProcessor(c);try{let w=new h.Contours(_.toMat(),{mode:h.cv.RETR_LIST,method:h.cv.CHAIN_APPROX_SIMPLE}),S=Nm(w,r,i,n,a,s,o,l,d);return w.destroy(),this.log(`Found ${S.length} potential text boxes (opencv)`),S}finally{_.destroy()}}postprocessWithCanvasNative(t,r,i,n,a,s,o){let d=this.platform.canvas.createProcessor(t).grayscale().threshold({thresh:0}).findRegions({foreground:"light",minArea:a,thresh:0,padding:{vertical:s,horizontal:o},scale:1/r}),h=Pm(d,i,n);return this.log(`Found ${h.length} potential text boxes (canvas-native)`),h}async debugDetectionCanvas(t,r,i){let n=this.debugging.debugFolder??"";await this.platform.saveDebugImage(t,"detection-debug",n),this.log(`Probability map visualized and saved to: ${n}`)}async debugDetectedBoxes(t,r){let i=this.platform.isCanvas(t)?t:await this.platform.canvas.prepareCanvas(t),n=this.platform.createCanvas(i.width,i.height),a=n.getContext("2d");a.drawImage(i,0,0);for(let o of r){let{x:l,y:d,width:h,height:c}=o;this.platform.canvas.getToolkit().drawLine({ctx:a,x:l,y:d,width:h,height:c})}let s=this.debugging.debugFolder??"";await this.platform.saveDebugImage(n,"boxes-debug",s),this.log(`Boxes visualized and saved to: ${s}`)}};function Um(e){return e.reason instanceof Error?e.reason:new DOMException("The batch operation was aborted.","AbortError")}function bb(e){if(Symbol.asyncIterator in e)return e[Symbol.asyncIterator]();let t=e[Symbol.iterator]();return{next:()=>Promise.resolve(t.next()),return:r=>Promise.resolve(t.return?.(r)??{done:!0,value:void 0})}}async function Za(e,t,r,i){let{settle:n,signal:a}=t,s=Math.max(1,Math.floor(t.concurrency));if(a?.aborted)throw Um(a);let o=0,l=0,d=!1,h=!1,c,f=Array.isArray(e)?e:null,y=f?null:bb(e),_=Promise.resolve(),w=async()=>{let b=_,T;_=new Promise(E=>{T=E}),await b;try{return await y.next()}finally{T()}},S=()=>{d=!0};a?.addEventListener("abort",S,{once:!0});let v=async()=>{for(;!d;){let b,T;if(f){if(o>=f.length)return;T=o++,b=f[T]}else{let E=await w();if(E.done||d)return;T=o++,b=E.value}try{let E=await r(b,T);if(d)return;i({index:T,status:"fulfilled",value:E})}catch(E){if(n)i({index:T,status:"rejected",reason:E});else{d=!0,h=!0,c=E;return}}finally{l++,t.onProgress?.(l,t.total)}}};try{await Promise.all(Array.from({length:s},()=>v()))}finally{a?.removeEventListener("abort",S),await y?.return?.()}if(a?.aborted)throw Um(a);if(h)throw c}function Wm(){let e=[],t=null,r=!1,i=null,n=()=>{let a=t;t=null,a?.()};return{push(a){e.push(a),n()},close(){r=!0,n()},fail(a){i={error:a},r=!0,n()},async*drain(){for(;;){for(;e.length>0;)yield e.shift();if(i)throw i.error;if(r)return;await new Promise(a=>{t=a})}}}}async function qm(e,t,r,i){let n=e.canvas.getToolkit(),a=[];for(let[s,o]of r.entries()){let l=n.crop({bbox:{x0:o.x,y0:o.y,x1:o.x+o.width,y1:o.y+o.height},canvas:t});if(i.saveCropsTo&&e.saveImage){let d=`crop_${String(s).padStart(3,"0")}.png`;await e.saveImage(l,[i.saveCropsTo,d].join(e.pathSeparator))}i.crop&&a.push(await wb(l))}return a}async function wb(e){let t=e;if(typeof t.toBuffer=="function"){let r=t.toBuffer("image/png");return r.buffer.slice(r.byteOffset,r.byteOffset+r.byteLength)}if(typeof t.convertToBlob=="function")return(await t.convertToBlob({type:"image/png"})).arrayBuffer();if(typeof t.toBlob=="function"){let r=t.toBlob.bind(t);return(await new Promise((n,a)=>r(s=>s?n(s):a(new Error("Canvas toBlob() returned null")),"image/png"))).arrayBuffer()}throw new Error("Canvas cannot be encoded to a PNG buffer on this platform")}function Gm(e){if(e.length===0)return{text:"",results:[],confidence:0};let t=e.map(i=>i.text).join(" "),r=e.reduce((i,n)=>i+n.confidence,0)/e.length;return{text:t,results:e,confidence:r}}function Fm(e){if(e.length===0)return{text:"",lines:[],confidence:0};let t=[],r=[],i=e[0];if(!i)return{text:"",lines:[],confidence:0};let n=i.box.y,a=i.box.height;for(let d of e){let{box:h}=d;Math.abs(h.y-n)<a/2?(r.push(d),a=(a*(r.length-1)+h.height)/r.length):(r.sort((c,f)=>c.box.x-f.box.x),t.push(r),r=[d],n=h.y,a=h.height)}r.length>0&&(r.sort((d,h)=>d.box.x-h.box.x),t.push(r));let s=t.map(d=>d.map(h=>h.text).join(" ")).join(`
`),o=t.reduce((d,h)=>d+h.reduce((c,f)=>c+f.confidence,0),0),l=t.reduce((d,h)=>d+h.length,0);return{text:s,lines:t,confidence:l>0?o/l:0}}function Ya(e){if(e.length===0)return[];let t=[...e].sort((o,l)=>o.box.y-l.box.y||o.box.x-l.box.x),r=[],i=t[0];if(!i)return[];let n=[i],a=i.box.height,s=i.box.height;for(let o=1;o<t.length;o++){let l=t[o],d=t[o-1];if(!l||!d)continue;let h=Math.abs(l.box.y-d.box.y),c=s*.5;h<=c?(n.push(l),a+=l.box.height,s=a/n.length):(n.sort((f,y)=>f.box.x-y.box.x),r.push(n),n=[l],a=l.box.height,s=l.box.height)}return n.length>0&&(n.sort((o,l)=>o.box.x-l.box.x),r.push(n)),r}var vb=4,Vm=16384;function Qa(e,t,r,i){let n=Math.min(...t.map(b=>b.box.x)),a=Math.min(...t.map(b=>b.box.y)),s=Math.max(...t.map(b=>b.box.x+b.box.width)),o=Math.max(...t.map(b=>b.box.y+b.box.height)),l={x:n,y:a,width:s-n,height:o-a},d=o-a,h=Math.max(1,Math.round(d*.4)),c=t.map(({box:b})=>Math.max(1,Math.round(b.width*Math.min(d/b.height,vb)))),f=c.reduce((b,T)=>b+T,0)+h*(t.length-1);if(f>Vm){let b=Vm/f;c=c.map(T=>Math.max(1,Math.round(T*b))),h=Math.max(1,Math.floor(h*b))}let y=c.reduce((b,T)=>b+T,0)+h*(t.length-1),_=r(y,d),w=_.getContext("2d");w.fillStyle="white",w.fillRect(0,0,y,d);let S=0,v=[];for(let b=0;b<t.length;b++){let T=t[b],E=c[b];if(!T||E===void 0)continue;let{box:I}=T,C=i.getToolkit().crop({bbox:{x0:I.x,y0:I.y,x1:I.x+I.width,y1:I.y+I.height},canvas:e});w.drawImage(C,0,0,I.width,I.height,S,0,E,d);let z=b<t.length-1?h:0;v.push(E+z),S+=E+z}return{mergedCanvas:_,mergedBox:l,cropWidths:v}}function Ja(e,t,r){let i=[...e];if(t.length!==i.length||r.length===0)return xb(e,r);let n=r.reduce((l,d)=>l+d,0),a=r.map(()=>""),s=0,o=(r[0]??0)/n;for(let l=0;l<i.length;l++){let d=t[l]??0;for(;d>=o&&s<r.length-1;)s++,o+=(r[s]??0)/n;a[s]+=i[l]??""}return a}var $b=4;function xb(e,t){if(t.length===1)return[e];let r=t.reduce((o,l)=>o+l,0),i=[...e],n=i.length>0?r/i.length:0,a=[],s=0;for(let o=0;o<t.length;o++){if(o===t.length-1){a.push(i.slice(s).join(""));break}let l=Math.min(s+Math.round((t[o]??0)/n),i.length),d=l,h=!1;for(let c=0;c<=$b&&!h;c++)for(let f of[l-c,l+c]){let y=i[f];if(f>s&&f<i.length&&y!==void 0&&/\s/.test(y)){d=f,h=!0;break}}a.push(i.slice(s,d).join("")),s=h?d+1:d}return a}function Hm(e,t,r,i){let n=[...e].sort((o,l)=>t(l)-t(o)),a=[],s=[];for(let o of n){let l=!1;for(let d=0;d<a.length;d++){let h=a[d],c=s[d];if(h===void 0||c===void 0)continue;let f=i*h.length;if(c+f+t(o)<=r){h.push(o),s[d]=c+t(o),l=!0;break}}l||(a.push([o]),s.push(t(o)))}return a}var Rr=class{cache=new Map;maxSize;constructor(t=10){this.maxSize=t}get(t){let r=this.cache.get(t);if(r!==void 0)return this.cache.delete(t),this.cache.set(t,r),r}set(t,r){if(this.cache.has(t))this.cache.delete(t);else if(this.cache.size>=this.maxSize){let i=this.cache.keys().next().value;i!==void 0&&this.cache.delete(i)}this.cache.set(t,r)}clear(){this.cache.clear()}static generateKey(t){let r=new Uint8Array(t);if(r.length===0)return"0_0";let i=Math.min(r.length,Sb),n=r.length-1,a=0;for(let s=0;s<i;s++){let o=i===1?0:Math.round(s*n/(i-1));a=(a<<5)-a+(r[o]??0),a=a&a}return`${a}_${r.length}`}},Sb=4096,es=new Rr;var Ti=class{options=Or;detectionSession=null;recognitionSession=null;detector=null;recognitor=null;platform;constructor(t,r){this.platform=t,this.options=xi({},Or,r),this.options.session=this.options.session||Or.session}log(t){this.options.debugging?.verbose&&console.log(`[PaddleOcrService:Base] ${t}`)}async recognize(t,r){(!this.detector||!this.recognitor)&&await this.initSessions();try{let i;if(typeof t=="string"){if(!t.startsWith("http")&&!t.startsWith("/"))throw new Error("Invalid image string format. Must be an HTTP URL, an absolute path, ArrayBuffer, or Canvas");i=await this.platform.loadResource(t,t)}else if(t instanceof ArrayBuffer)i=t;else if(typeof t.toBuffer=="function"){let y=t.toBuffer("image/png");i=y.buffer.slice(y.byteOffset,y.byteOffset+y.byteLength)}else{let f=t,w=f.getContext("2d",{willReadFrequently:!0}).getImageData(0,0,f.width,f.height).data;i=w.buffer.slice(w.byteOffset,w.byteOffset+w.byteLength)}let n=Rr.generateKey(i);if(!r?.noCache&&!r?.dictionary){let f=es.get(n);if(f)return this.log("Using cached OCR result"),r?.flatten?{text:f.text,results:f.lines?f.lines.flat():f.results??[],confidence:f.confidence}:f}let a=[],s=typeof t=="string"||t instanceof ArrayBuffer?await this.platform.canvas.prepareCanvas(i):t;if(a=await this.detector.run(s),a.length===0)return r?.flatten?{text:"",results:[],confidence:0}:{text:"",lines:[],confidence:0};let o=this.options.recognition?.charactersDictionary;if(r?.dictionary){let f="";if(typeof r.dictionary=="string"){let y=await this.platform.loadResource(r.dictionary,r.dictionary);f=new TextDecoder("utf-8").decode(y)}else f=new TextDecoder("utf-8").decode(r.dictionary);o=Ar(f)}let l=r?.strategy??this.options.recognition?.strategy??"per-line",d=await this.recognitor.run(s,a,o,l),h=Fm(d),c=r?.flatten?Gm(d):h;return!r?.noCache&&!r?.dictionary&&es.set(n,c),c}catch(i){let n=i instanceof Error?i:new Error(String(i));throw console.error("recognize: error",n.message,n.stack),i}}async detect(t,r){this.detector||await this.initSessions();let{crop:i,saveCropsTo:n,...a}=r??{},s=Object.keys(a).length>0?new rr(this.platform,this.detectionSession,{...this.options.detection,...a},this.options.debugging,this.options.processing?.engine??vi):this.detector,o;if(typeof t=="string"){if(!t.startsWith("http")&&!t.startsWith("/"))throw new Error("Invalid image string format. Must be an HTTP URL, an absolute path, ArrayBuffer, or Canvas");o=await this.platform.canvas.prepareCanvas(await this.platform.loadResource(t,t))}else t instanceof ArrayBuffer?o=await this.platform.canvas.prepareCanvas(t):o=t;let l=(await s.run(o)).filter(h=>h.width>0&&h.height>0);if(!i&&!n)return{boxes:l};let d=await qm(this.platform,o,l,{crop:i,saveCropsTo:n});return i?{boxes:l,crops:d}:{boxes:l}}async batchRecognize(t,r){let i=r?.settle??!1,n=[];return await Za(t,{concurrency:this.resolveConcurrency(r?.concurrency),settle:i,signal:r?.signal,onProgress:r?.onProgress,total:Array.isArray(t)?t.length:void 0},a=>this.recognize(a,r),a=>{n[a.index]=a}),i?n:n.map(a=>a.status==="fulfilled"?a.value:void 0)}async*batchRecognizeStream(t,r){let i=Wm(),n=(async()=>{try{await Za(t,{concurrency:this.resolveConcurrency(r?.concurrency),settle:r?.settle??!1,signal:r?.signal,onProgress:r?.onProgress,total:Array.isArray(t)?t.length:void 0},a=>this.recognize(a,r),a=>i.push(a)),i.close()}catch(a){i.fail(a)}})();yield*i.drain(),await n}resolveConcurrency(t){return typeof t=="number"&&t>0?Math.floor(t):(this.options.session?.executionProviders??[]).some(n=>{let a=(typeof n=="string"?n:n.name).toLowerCase();return a!=="cpu"&&a!=="wasm"})?1:4}};var jm=new Set(["cpu","wasm"]);function Tb(e){return typeof e=="string"?e:e.name}async function Km(e,t,r,i,n){let a=r??{};try{return await e.InferenceSession.create(t,a)}catch(s){let l=(a.executionProviders??[]).map(Tb);if(l.every(_=>jm.has(_))||l.length===0)throw s;let c=l.find(_=>jm.has(_))??(l.includes("wasm")?"wasm":"cpu"),f=s instanceof Error?s.message:String(s);i(`executionProviders=${JSON.stringify(l)} failed (${f}); falling back to ["${c}"].`);let y={...a,executionProviders:[c]};return n?.(y),e.InferenceSession.create(t,y)}}var ts=null;function rs(e){ts=e}function Be(){if(!ts)throw new Error('No canvas platform registered. Import "ppu-ocv" (Node), "ppu-ocv/web" (browser), "ppu-ocv/canvas" (Node canvas-only), "ppu-ocv/canvas-web" (browser canvas-only), or "ppu-ocv/canvas-mobile" (React Native / Skia) to auto-register.');return ts}function Xm(e){return typeof e=="object"&&e!==null&&typeof e.getContext=="function"&&typeof e.width=="number"&&typeof e.height=="number"}var Ei={createCanvas(e,t){if(typeof OffscreenCanvas<"u")return new OffscreenCanvas(e,t);if(typeof document<"u"){let r=document.createElement("canvas");return r.width=e,r.height=t,r}throw new Error("No canvas implementation available in this environment.")},async loadImage(e){let t;if(e instanceof ArrayBuffer)t=new Blob([e]);else if(typeof e=="string")t=await(await fetch(e)).blob();else throw new Error("loadImage: unsupported source type");let r=await createImageBitmap(t),i=Ei.createCanvas(r.width,r.height);return i.getContext("2d").drawImage(r,0,0),r.close(),i},isCanvas(e){return typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof OffscreenCanvas<"u"&&e instanceof OffscreenCanvas}};var ir=class e{static _baseInstance=null;step=0;constructor(){}static getInstance(){return e._baseInstance||(e._baseInstance=new e),e._baseInstance}crop(t){let{bbox:r,canvas:i}=t,n=Be().createCanvas(r.x1-r.x0,r.y1-r.y0);return n.getContext("2d").drawImage(i,r.x0,r.y0,r.x1-r.x0,r.y1-r.y0,0,0,n.width,n.height),n}isDirty(t){let{canvas:r,threshold:i=127.5,majorColorThreshold:n=.97}=t,a=0,s=0,o=this.crop({bbox:{x0:r.width*.1,y0:r.height*.1,x1:r.width*.9,y1:r.height*.9},canvas:r}),d=o.getContext("2d").getImageData(0,0,o.width,o.height).data;for(let c=0;c<d.length;c+=4){let f=d[c],y=d[c+1],_=d[c+2];f>=i&&y>=i&&_>=i?a++:s++}return Math.max(a,s)/(s+a)<n}drawLine(t){let{ctx:r,x:i,y:n,width:a,height:s,lineWidth:o=2,color:l="blue"}=t;r.beginPath(),r.strokeStyle=l,r.lineWidth=o,r.strokeRect(i,n,a,s),r.closePath()}drawContour(t){let{ctx:r,contour:i,strokeStyle:n="red",lineWidth:a=2}=t,s=i.data32S;if(!(s.length<4)){r.strokeStyle=n,r.lineWidth=a,r.beginPath(),r.moveTo(s[0]??0,s[1]??0);for(let o=2;o<s.length;o+=2)r.lineTo(s[o]??0,s[o+1]??0);r.closePath(),r.stroke()}}};async function Zm(e){return Xm(e)?e:Be().loadImage(e)}async function Ym(e){if(e instanceof ArrayBuffer)return e;if(typeof e.toBuffer=="function"){let a=e.toBuffer("image/png"),s=new ArrayBuffer(a.byteLength);return new Uint8Array(s).set(new Uint8Array(a)),s}let t=e.toBlob;if(typeof t=="function")return(await new Promise((s,o)=>{t.call(e,l=>l?s(l):o(new Error("toBlob returned null")),"image/png")})).arrayBuffer();if(typeof e.convertToBlob=="function")return(await e.convertToBlob({type:"image/png"})).arrayBuffer();if(typeof e.toDataURL=="function"){let s=e.toDataURL("image/png").replace(/^data:image\/png;base64,/,""),o=atob(s),l=new ArrayBuffer(o.length),d=new Uint8Array(l);for(let h=0;h<o.length;h++)d[h]=o.charCodeAt(h);return l}let i=e.getContext("2d").getImageData(0,0,e.width,e.height),n=new ArrayBuffer(i.data.byteLength);return new Uint8Array(n).set(new Uint8Array(i.data.buffer,i.data.byteOffset,i.data.byteLength)),n}function Qm(e,t,r,i={}){let{foreground:n="light",thresh:a=127,minArea:s=1,maxArea:o=1/0,padding:l,scale:d=1}=i,h=new Uint8Array(t*r),c=[],f=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]],y=_=>{let w=e[_]??0;return n==="light"?w>a:w<=a};for(let _=0;_<r;_++)for(let w=0;w<t;w++){let S=_*t+w;if(h[S]||(h[S]=1,!y(S*4)))continue;let v=[S],b=w,T=w,E=_,I=_,C=0;for(;v.length>0;){let z=v.pop();if(z===void 0)break;C++;let $=z%t,B=(z-$)/t;$<b?b=$:$>T&&(T=$),B<E?E=B:B>I&&(I=B);for(let[W,F]of f){let q=$+W,P=B+F;if(q<0||q>=t||P<0||P>=r)continue;let K=P*t+q;h[K]||(h[K]=1,y(K*4)&&v.push(K))}}if(C>=s&&C<=o){let z=b,$=E,B=T+1,W=I+1;if(l){let F=W-$,q=Math.round(F*(l.vertical??0)),P=Math.round(F*(l.horizontal??0));z=Math.max(0,z-P),$=Math.max(0,$-q),B=Math.min(t,B+P),W=Math.min(r,W+q)}d!==1&&(z=Math.max(0,Math.round(z*d)),$=Math.max(0,Math.round($*d)),B=Math.round(B*d),W=Math.round(W*d)),c.push({bbox:{x0:z,y0:$,x1:B,y1:W},area:C})}}return c}var nr=class{_canvas;constructor(t){this._canvas=t}get width(){return this._canvas.width}get height(){return this._canvas.height}resize(t){let{width:r,height:i}=t,n=Be().createCanvas(r,i);return n.getContext("2d").drawImage(this._canvas,0,0,r,i),this._canvas=n,this}grayscale(){let{width:t,height:r}=this._canvas,i=this._canvas.getContext("2d").getImageData(0,0,t,r),n=i.data;for(let s=0;s<n.length;s+=4){let o=Math.round(.299*(n[s]??0)+.587*(n[s+1]??0)+.114*(n[s+2]??0));n[s]=o,n[s+1]=o,n[s+2]=o}let a=Be().createCanvas(t,r);return a.getContext("2d").putImageData(i,0,0),this._canvas=a,this}convert(t={}){let{alpha:r=1,beta:i=0}=t;if(r===1&&i===0)return this;let{width:n,height:a}=this._canvas,s=this._canvas.getContext("2d").getImageData(0,0,n,a),o=s.data;for(let d=0;d<o.length;d+=4)o[d]=Math.round((o[d]??0)*r+i),o[d+1]=Math.round((o[d+1]??0)*r+i),o[d+2]=Math.round((o[d+2]??0)*r+i);let l=Be().createCanvas(n,a);return l.getContext("2d").putImageData(s,0,0),this._canvas=l,this}invert(){let{width:t,height:r}=this._canvas,i=this._canvas.getContext("2d").getImageData(0,0,t,r),n=i.data;for(let s=0;s<n.length;s+=4)n[s]=255-(n[s]??0),n[s+1]=255-(n[s+1]??0),n[s+2]=255-(n[s+2]??0);let a=Be().createCanvas(t,r);return a.getContext("2d").putImageData(i,0,0),this._canvas=a,this}threshold(t={}){let{thresh:r=127,maxValue:i=255}=t,{width:n,height:a}=this._canvas,s=this._canvas.getContext("2d").getImageData(0,0,n,a),o=s.data;for(let d=0;d<o.length;d+=4){let c=(o[d]===o[d+1]&&o[d+1]===o[d+2]?o[d]??0:Math.round(.299*(o[d]??0)+.587*(o[d+1]??0)+.114*(o[d+2]??0)))>r?i:0;o[d]=c,o[d+1]=c,o[d+2]=c}let l=Be().createCanvas(n,a);return l.getContext("2d").putImageData(s,0,0),this._canvas=l,this}border(t={}){let{size:r=10,color:i="white"}=t,{width:n,height:a}=this._canvas,s=Be().createCanvas(n+r*2,a+r*2),o=s.getContext("2d");return o.fillStyle=i,o.fillRect(0,0,s.width,s.height),o.drawImage(this._canvas,r,r),this._canvas=s,this}rotate(t){let{angle:r,cx:i=this._canvas.width/2,cy:n=this._canvas.height/2}=t;if(r===0)return this;let{width:a,height:s}=this._canvas,o=Be().createCanvas(a,s),l=o.getContext("2d");return l.save(),l.translate(i,n),l.rotate(-r*Math.PI/180),l.drawImage(this._canvas,-i,-n),l.restore(),this._canvas=o,this}findRegions(t={}){let{width:r,height:i}=this._canvas,n=this._canvas.getContext("2d").getImageData(0,0,r,i).data;return Qm(n,r,i,t)}toCanvas(){return this._canvas}static async prepareCanvas(t){return Zm(t)}static async prepareBuffer(t){return Ym(t)}};rs(Ei);var It=class{pathSeparator="/";ort=jt;createCanvas(t,r){let i=Be().createCanvas(t,r);return i.getContext.bind(i)("2d",{willReadFrequently:!0}),i}isCanvas(t){return!!t&&typeof t.getContext=="function"}async loadResource(t,r){if(t instanceof ArrayBuffer)return t;let i=typeof t=="string"?t:r,n=await fetch(i,{referrerPolicy:"no-referrer"});if(!n.ok)throw new Error(`Failed to fetch resource from ${i}`);return n.arrayBuffer()}async saveDebugImage(t,r,i){return Promise.resolve()}canvas={prepareCanvas:t=>nr.prepareCanvas(t),createProcessor:t=>new nr(t),getToolkit:()=>ir.getInstance()}};function Eb(){return`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ge.versions.web??ge.versions.common}/dist/`}function Ii(){return typeof globalThis.WorkerGlobalScope=="function"}function Ib(){!(typeof window<"u"||Ii())||ge.wasm.wasmPaths||(ge.wasm.wasmPaths=Eb())}Ib();async function ki(){if(typeof navigator>"u")return!1;let e=navigator;if(!e.gpu||typeof e.gpu.requestAdapter!="function")return!1;try{let t=await e.gpu.requestAdapter();return t!=null}catch{return!1}}async function is(){return await ki()?["webgpu","wasm"]:["wasm"]}var ar=class extends rr{constructor(t,r={},i={}){super(new It,t,r,i,"canvas-native")}};or();Ci();async function us(e,t,r){let i=t.options.imageHeight??48,n=Math.max(1,t.options.recBatchSize??6),a=r??t.options.charactersDictionary??[],s=t.options.spaceRecovery??!1,o=t.engine==="opencv"?t.platform.imageProcessor:void 0,l=await Promise.all(e.map(c=>Dr(c,i,o,t.platform.canvas.createProcessor.bind(t.platform.canvas)))),d=l.map((c,f)=>f).sort((c,f)=>{let y=l[c]?.tensorWidth??0,_=l[f]?.tensorWidth??0;return y-_}),h=Array.from({length:e.length});for(let c=0;c<d.length;c+=n){let f=d.slice(c,c+n),y=Math.max(...f.map(v=>l[v]?.tensorWidth??1)),_=i*y,w=new Float32Array(f.length*3*_);f.forEach((v,b)=>{let T=l[v];if(!T)return;let E=b*3*_;for(let I=0;I<3;I++)for(let C=0;C<i;C++){let z=(I*i+C)*T.tensorWidth,$=E+(I*i+C)*y;w.set(T.imageTensor.subarray(z,z+T.tensorWidth),$);let B=T.imageTensor[z+T.tensorWidth-1]??0;w.fill(B,$+T.tensorWidth,$+y)}});let S;try{S=new t.platform.ort.Tensor("float32",w,[f.length,3,i,y]);let v=await t.runInference(S),[,b,T]=v.dims,E=v.data,I=(b??0)*(T??0);f.forEach((C,z)=>{let $=(l[C]?.tensorWidth??y)/y,B=Math.max(1,Math.min(b??0,Math.ceil((b??0)*$)));h[C]=ss(E.subarray(z*I,z*I+B*(T??0)),B,T??0,a,s)})}finally{S?.dispose()}}return h}function ug(e){let r=e.inputMetadata?.[0]?.shape?.[0];return typeof r!="number"||r<0}or();or();Ci();function lg(e,t){if(!(t.options.rotateVerticalCrops??!0)||e.height/e.width<1.5)return e;let r=t.platform.createCanvas(e.height,e.width),i=r.getContext("2d");return i.translate(0,e.width),i.rotate(-Math.PI/2),i.drawImage(e,0,0),r}function ls(e,t,r){return r.getToolkit().crop({bbox:{x0:t.x,y0:t.y,x1:t.x+t.width,y1:t.y+t.height},canvas:e})}async function Ab(e,t,r){let i=t.options.imageHeight??48,n=t.engine==="opencv"?t.platform.imageProcessor:void 0,{imageTensor:a,tensorWidth:s,tensorHeight:o}=await Dr(e,i,n,t.platform.canvas.createProcessor.bind(t.platform.canvas)),l;try{l=new t.platform.ort.Tensor("float32",a,[1,3,o,s]);let d=await t.runInference(l),h=r??t.options.charactersDictionary??[];return as(d,h,s,t.debugging.verbose)}finally{l?.dispose()}}function zi(e){return[...e].sort((t,r)=>Math.abs(t.box.y-r.box.y)<(t.box.height+r.box.height)/4?t.box.x-r.box.x:t.box.y-r.box.y)}async function dg(e,t,r,i,n){let a=r.debugging.debugFolder?`${r.debugging.debugFolder}${r.platform.pathSeparator}crops`:"";if(r.debugging.debug&&a){let o=r.platform.canvas.getToolkit();"clearOutput"in o&&typeof o.clearOutput=="function"&&o.clearOutput(a)}if(!r.debugging.debug){let o=t.map(({box:h})=>lg(ls(e,h,r.platform.canvas),r)),l=await us(o,r,n),d=t.map(({box:h},c)=>({text:l[c]?.text??"",box:h,confidence:l[c]?.confidence??0}));return zi(d)}let s=[];for(let{box:o,index:l}of t){let d=await i(e,o,l,t.length,a,n);d!==null&&s.push(d)}return zi(s)}async function pg(e,t,r,i){let n=Ya(t),a=[],s=[];for(let d of n){let h=d[0];if(h)if(d.length===1)s.push(lg(ls(e,h.box,r.platform.canvas),r)),a.push({lineBoxes:d,cropWidths:null});else{let{mergedCanvas:c,cropWidths:f}=Qa(e,d,r.platform.createCanvas.bind(r.platform),r.platform.canvas);s.push(c),a.push({lineBoxes:d,cropWidths:f})}}let o=await us(s,r,i),l=[];return a.forEach((d,h)=>{let c=o[h];if(c)if(d.cropWidths===null){let f=d.lineBoxes[0];f&&l.push({text:c.text,box:f.box,confidence:c.confidence})}else{let f=Ja(c.text,c.positions,d.cropWidths);for(let y=0;y<d.lineBoxes.length;y++){let _=d.lineBoxes[y];_&&l.push({text:(f[y]??"").trim(),box:_.box,confidence:c.confidence})}}}),zi(l)}async function cg(e,t,r,i){let n=Ya(t),a=r.options.imageHeight??48,s=20,o=[];for(let _ of n)if(_.length===1){let w=_[0];if(!w)continue;let S=ls(e,w.box,r.platform.canvas);o.push({canvas:S,boxes:_,cropWidths:[S.width]})}else{let{mergedCanvas:w,cropWidths:S}=Qa(e,_,r.platform.createCanvas.bind(r.platform),r.platform.canvas);o.push({canvas:w,boxes:_,cropWidths:S})}let l=o.map(({canvas:_,boxes:w,cropWidths:S},v)=>{let b=_.width/_.height,T=Math.max(sr,Math.round(a*b));return{canvas:_,boxes:w,cropWidths:S,resizedWidth:T,originalHeight:_.height,index:v}}),d=Math.max(...l.map(_=>_.resizedWidth)),h=r.options.crossLineWidthFactor??1.5,c=Math.round(d*h),f=Hm(l,_=>_.resizedWidth,c,s),y=[];for(let _ of f){let w=[..._].sort((P,K)=>P.index-K.index),S=Math.max(...w.map(P=>P.originalHeight)),v=w.map(P=>{if(P.originalHeight>=S)return P.resizedWidth;let K=S/P.originalHeight;return Math.max(sr,Math.round(P.resizedWidth*K))}),T=v.reduce((P,K)=>P+K,0)+s*(w.length-1),E=r.platform.createCanvas(T,a),I=E.getContext("2d");I.fillStyle="white",I.fillRect(0,0,T,a);let C=0;for(let P=0;P<w.length;P++){let K=w[P],O=v[P];K===void 0||O===void 0||(I.drawImage(K.canvas,0,0,K.canvas.width,K.canvas.height,C,0,O,a),C+=O,P<w.length-1&&(C+=s))}let{text:z,confidence:$,positions:B}=await Ab(E,r,i),W=[],F=[];for(let P=0;P<w.length;P++){let K=w[P],O=v[P];if(!K||O===void 0)continue;let U=O/K.canvas.width;for(let J=0;J<K.boxes.length;J++){let re=K.boxes[J];if(!re)continue;let X=(K.cropWidths[J]??0)*U;J===K.boxes.length-1&&P<w.length-1&&(X+=s),W.push(X),F.push(re)}}let q=Ja(z,B,W);for(let P=0;P<F.length;P++){let K=F[P];K&&y.push({text:(q[P]??"").trim(),box:K.box,confidence:$})}}return zi(y)}var Oi=class{options;debugging;session;platform;engine;constructor(t,r,i={},n={},a="opencv"){this.platform=t,this.session=r,this.options={...wi,...i},this.debugging={...tr,...n},a==="opencv"&&!this.platform.imageProcessor?this.engine="canvas-native":this.engine=a}log(t){this.debugging.verbose&&console.log(`[RecognitionService] ${t}`)}async run(t,r,i,n="per-line"){this.log("Starting text recognition process");try{let a;this.platform.isCanvas(t)?a=t:this.engine==="opencv"&&this.platform.imageProcessor?a=await this.platform.imageProcessor.prepareCanvas(t):a=await this.platform.canvas.prepareCanvas(t);let s=this.filterValidBoxes(r);if(s.length===0)return[];let{canvas:o,ratio:l}=this.buildCropCanvas(a),d=l===1?s:s.map(y=>({...y,box:hg(y.box,l)})),h=this.buildContext(),c;switch(n){case"cross-line":c=await cg(o,d,h,i);break;case"per-line":c=await pg(o,d,h,i);break;default:c=await dg(o,d,h,(y,_,w,S,v,b)=>this.processBox(y,_,w,S,v,b),i)}l!==1&&(c=c.map(y=>({...y,box:hg(y.box,1/l)})));let f=this.options.minimumConfidence??.5;return f>0?c.filter(y=>{let _=/[\p{L}\p{N}]/u.test(y.text)?f:Math.min(1,f+.3);return y.confidence>=_}):c}catch(a){return console.error("Error during text recognition:",a instanceof Error?a.message:String(a)),[]}}buildContext(){return{platform:this.platform,options:ug(this.session)?this.options:{...this.options,recBatchSize:1},debugging:this.debugging,engine:this.engine,runInference:t=>this.runInference(t)}}filterValidBoxes(t){return t.map((r,i)=>({box:r,index:i})).filter(({box:r,index:i})=>this.isValidBox(r,i))}buildCropCanvas(t){let{width:r,height:i}=t,n=this.options.maxCropSourceSideLength??2e3,{width:a,height:s,ratio:o}=Si(r,i,n);if(o===1)return{canvas:t,ratio:1};let l=this.platform.createCanvas(a,s);return l.getContext("2d").drawImage(t,0,0,r,i,0,0,a,s),{canvas:l,ratio:o}}async processBox(t,r,i,n,a,s){let o=Date.now();try{let l=this.platform.canvas.getToolkit().crop({bbox:{x0:r.x,y0:r.y,x1:r.x+r.width,y1:r.y+r.height},canvas:t}),d=this.buildContext(),{text:h,confidence:c}=await this.recognizeTextViaContext(l,d,s);if(this.debugging.debug&&a){await this.platform.saveDebugImage(l,`crop_${String(i).padStart(3,"0")}.png`,a);let f=Date.now()-o;this.log(`Box ${i+1}/${n}: [x:${r.x}, y:${r.y}, w:${r.width}, h:${r.height}]
	 \u2192 "${h}" (processed in ${f}ms)
`)}return{text:h,box:r,confidence:c}}catch(l){let d=l instanceof Error?l:new Error(String(l));return console.error(`Error processing box ${i+1}: ${d.message}`,d.stack),null}}async recognizeTextViaContext(t,r,i){let{preprocessImage:n}=await Promise.resolve().then(()=>(Ci(),og)),{decodeResults:a}=await Promise.resolve().then(()=>(or(),ng)),s=r.options.imageHeight??48,o=r.engine==="opencv"?r.platform.imageProcessor:void 0,{imageTensor:l,tensorWidth:d,tensorHeight:h}=await n(t,s,o,r.platform.canvas.createProcessor.bind(r.platform.canvas)),c;try{c=new r.platform.ort.Tensor("float32",l,[1,3,h,d]);let f=await r.runInference(c),y=i??r.options.charactersDictionary??[];return a(f,y,d,this.debugging.verbose,r.options.spaceRecovery??!1)}finally{c?.dispose()}}isValidBox(t,r){return t.width<=0||t.height<=0?(console.warn(`Skipping invalid box ${r+1}: w=${t.width}, h=${t.height}`),!1):!0}async runInference(t){let r=this.options.mainThreadYieldMs??0;r>0&&await new Promise(o=>setTimeout(o,r));let i={x:t},n=await this.session.run(i),a=Object.keys(n)[0],s=a?n[a]:void 0;if(!s)throw new Error(`Recognition output tensor '${a}' not found. Available keys: ${Object.keys(n)}`);return s}};function hg(e,t){return{x:Math.round(e.x*t),y:Math.round(e.y*t),width:Math.max(1,Math.round(e.width*t)),height:Math.max(1,Math.round(e.height*t))}}function Rb(e,t=typeof window<"u"&&!Ii()){return t?{mainThreadYieldMs:Rm,...e}:e}var ur=class extends Oi{constructor(t,r={},i={}){super(new It,t,Rb(r),i,"canvas-native")}};var Db={graphOptimizationLevel:"all"},Mr=class extends Ti{constructor(t){super(new It,t),(this.options.session===void 0||Object.keys(this.options.session).length===0)&&(this.options.session=Db)}async initSessions(){throw new Error("Initialization is handled proactively in PaddleOcrService. Call initialize() instead.")}async _loadResource(t,r){if(t instanceof ArrayBuffer)return this.log("Loading resource from ArrayBuffer"),t;let i=typeof t=="string"?t:r;return this.log(`Fetching resource from URL: ${i}`),Mm(i)}async _resolveSessionExecutionProviders(){let t=this.options.session??{};if(t.executionProviders&&t.executionProviders.length>0){this.log(`Using user-provided executionProviders: ${JSON.stringify(t.executionProviders)}`);return}let r=await is();this.options.session={...t,executionProviders:r},this.log(`Resolved executionProviders: ${JSON.stringify(r)}`)}async _createSession(t){return Km(jt,t,this.options.session,r=>console.warn(`[PaddleOcrService] ${r}`),r=>this.options.session=r)}async initialize(){try{this.log("Initializing PaddleOcrService (Web)..."),await this._resolveSessionExecutionProviders();let[t,r,i]=await Promise.all([this._loadResource(this.options.model?.detection,_t.detection),this._loadResource(this.options.model?.recognition,_t.recognition),this._loadResource(this.options.model?.charactersDictionary,_t.charactersDictionary)]),[n,a]=await Promise.all([this._createSession(new Uint8Array(t)),this._createSession(new Uint8Array(r))]);this.detectionSession=n,this.recognitionSession=a,this.options.model&&(this.options.model.detection=t),this.options.model&&(this.options.model.recognition=r),this.log(`Detection ONNX model loaded successfully
	input: ${n.inputNames}
	output: ${n.outputNames}`),this.log(`Recognition ONNX model loaded successfully
	input: ${a.inputNames}
	output: ${a.outputNames}`);let s=Ar(i);if(s.length===0)throw new Error("Character dictionary is empty or could not be loaded.");this.options.model&&(this.options.model.charactersDictionary=i),this.options.recognition&&(this.options.recognition.charactersDictionary=s),this.log(`Character dictionary loaded with ${s.length} entries.`),this.detector=new ar(n,this.options.detection,this.options.debugging),this.recognitor=new ur(a,this.options.recognition,this.options.debugging),this.options.model&&(this.options.model.detection=void 0),this.options.model&&(this.options.model.recognition=void 0)}catch(t){throw console.error("Failed to initialize PaddleOcrService Web:",t),t}}isInitialized(){return this.detectionSession!==null&&this.recognitionSession!==null}async changeDetectionModel(t){this.log("Changing detection model...");let r=await this._loadResource(t,_t.detection);await this.detectionSession?.release(),this.detectionSession=await this._createSession(new Uint8Array(r)),this.detector=new ar(this.detectionSession,this.options.detection,this.options.debugging),this.options.model&&(this.options.model.detection=r),this.log("Detection model changed successfully.")}async changeRecognitionModel(t){this.log("Changing recognition model...");let r=await this._loadResource(t,_t.recognition);await this.recognitionSession?.release(),this.recognitionSession=await this._createSession(new Uint8Array(r)),this.recognitor=new ur(this.recognitionSession,this.options.recognition,this.options.debugging),this.options.model&&(this.options.model.recognition=r),this.log("Recognition model changed successfully.")}async changeTextDictionary(t){this.log("Changing text dictionary...");let r=await this._loadResource(t,_t.charactersDictionary),i=Ar(r);if(i.length===0)throw new Error("Character dictionary is empty or could not be loaded.");this.options.model&&(this.options.model.charactersDictionary=r),this.options.recognition&&(this.options.recognition.charactersDictionary=i),this.log(`Character dictionary changed successfully with ${i.length} entries.`)}async recognize(t,r){return super.recognize(t,r)}async destroy(){await this.detectionSession?.release(),await this.recognitionSession?.release(),this.detectionSession=null,this.recognitionSession=null,this.detector=null,this.recognitor=null}};window.PpuOcr={PaddleOcrService:Mr,isWebGpuAvailable:ki,ort:jt};})();
/*! Bundled license information:

onnxruntime-web/dist/ort.bundle.min.mjs:
  (*!
   * ONNX Runtime Web v1.29.0
   * Copyright (c) Microsoft Corporation. All rights reserved.
   * Licensed under the MIT License.
   *)

onnxruntime-web/dist/ort.bundle.min.mjs:
  (**
   * @license
   * Copyright 2021 Google LLC. All Rights Reserved.
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   * http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   * =============================================================================
   *)
  (**
   * @license
   * Copyright 2020 Google LLC. All Rights Reserved.
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   * http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   * =============================================================================
   *)
  (**
   * @license
   * Copyright 2019 Google LLC. All Rights Reserved.
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   * http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   * =============================================================================
   *)
*/
