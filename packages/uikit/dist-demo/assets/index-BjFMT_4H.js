(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))s(a);new MutationObserver(a=>{for(const r of a)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function t(a){const r={};return a.integrity&&(r.integrity=a.integrity),a.referrerPolicy&&(r.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?r.credentials="include":a.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function s(a){if(a.ep)return;a.ep=!0;const r=t(a);fetch(a.href,r)}})();const Ot=globalThis,ks=Ot.ShadowRoot&&(Ot.ShadyCSS===void 0||Ot.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,Is=Symbol(),js=new WeakMap;let Ji=class{constructor(e,t,s){if(this._$cssResult$=!0,s!==Is)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(ks&&e===void 0){const s=t!==void 0&&t.length===1;s&&(e=js.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),s&&js.set(t,e))}return e}toString(){return this.cssText}};const ea=i=>new Ji(typeof i=="string"?i:i+"",void 0,Is),Q=(i,...e)=>{const t=i.length===1?i[0]:e.reduce((s,a,r)=>s+(o=>{if(o._$cssResult$===!0)return o.cssText;if(typeof o=="number")return o;throw Error("Value passed to 'css' function must be a 'css' function result: "+o+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(a)+i[r+1],i[0]);return new Ji(t,i,Is)},Xa=(i,e)=>{if(ks)i.adoptedStyleSheets=e.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const t of e){const s=document.createElement("style"),a=Ot.litNonce;a!==void 0&&s.setAttribute("nonce",a),s.textContent=t.cssText,i.appendChild(s)}},Gs=ks?i=>i:i=>i instanceof CSSStyleSheet?(e=>{let t="";for(const s of e.cssRules)t+=s.cssText;return ea(t)})(i):i;const{is:Za,defineProperty:Qa,getOwnPropertyDescriptor:Ja,getOwnPropertyNames:er,getOwnPropertySymbols:tr,getPrototypeOf:sr}=Object,Kt=globalThis,Ws=Kt.trustedTypes,ir=Ws?Ws.emptyScript:"",ar=Kt.reactiveElementPolyfillSupport,ct=(i,e)=>i,us={toAttribute(i,e){switch(e){case Boolean:i=i?ir:null;break;case Object:case Array:i=i==null?i:JSON.stringify(i)}return i},fromAttribute(i,e){let t=i;switch(e){case Boolean:t=i!==null;break;case Number:t=i===null?null:Number(i);break;case Object:case Array:try{t=JSON.parse(i)}catch{t=null}}return t}},ta=(i,e)=>!Za(i,e),Ys={attribute:!0,type:String,converter:us,reflect:!1,useDefault:!1,hasChanged:ta};Symbol.metadata??=Symbol("metadata"),Kt.litPropertyMetadata??=new WeakMap;let Xe=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??=[]).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=Ys){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const s=Symbol(),a=this.getPropertyDescriptor(e,s,t);a!==void 0&&Qa(this.prototype,e,a)}}static getPropertyDescriptor(e,t,s){const{get:a,set:r}=Ja(this.prototype,e)??{get(){return this[t]},set(o){this[t]=o}};return{get:a,set(o){const n=a?.call(this);r?.call(this,o),this.requestUpdate(e,n,s)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??Ys}static _$Ei(){if(this.hasOwnProperty(ct("elementProperties")))return;const e=sr(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(ct("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(ct("properties"))){const t=this.properties,s=[...er(t),...tr(t)];for(const a of s)this.createProperty(a,t[a])}const e=this[Symbol.metadata];if(e!==null){const t=litPropertyMetadata.get(e);if(t!==void 0)for(const[s,a]of t)this.elementProperties.set(s,a)}this._$Eh=new Map;for(const[t,s]of this.elementProperties){const a=this._$Eu(t,s);a!==void 0&&this._$Eh.set(a,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const s=new Set(e.flat(1/0).reverse());for(const a of s)t.unshift(Gs(a))}else e!==void 0&&t.push(Gs(e));return t}static _$Eu(e,t){const s=t.attribute;return s===!1?void 0:typeof s=="string"?s:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(e=>e(this))}addController(e){(this._$EO??=new Set).add(e),this.renderRoot!==void 0&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const s of t.keys())this.hasOwnProperty(s)&&(e.set(s,this[s]),delete this[s]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Xa(e,this.constructor.elementStyles),e}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(e=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach(e=>e.hostDisconnected?.())}attributeChangedCallback(e,t,s){this._$AK(e,s)}_$ET(e,t){const s=this.constructor.elementProperties.get(e),a=this.constructor._$Eu(e,s);if(a!==void 0&&s.reflect===!0){const r=(s.converter?.toAttribute!==void 0?s.converter:us).toAttribute(t,s.type);this._$Em=e,r==null?this.removeAttribute(a):this.setAttribute(a,r),this._$Em=null}}_$AK(e,t){const s=this.constructor,a=s._$Eh.get(e);if(a!==void 0&&this._$Em!==a){const r=s.getPropertyOptions(a),o=typeof r.converter=="function"?{fromAttribute:r.converter}:r.converter?.fromAttribute!==void 0?r.converter:us;this._$Em=a;const n=o.fromAttribute(t,r.type);this[a]=n??this._$Ej?.get(a)??n,this._$Em=null}}requestUpdate(e,t,s,a=!1,r){if(e!==void 0){const o=this.constructor;if(a===!1&&(r=this[e]),s??=o.getPropertyOptions(e),!((s.hasChanged??ta)(r,t)||s.useDefault&&s.reflect&&r===this._$Ej?.get(e)&&!this.hasAttribute(o._$Eu(e,s))))return;this.C(e,t,s)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:s,reflect:a,wrapped:r},o){s&&!(this._$Ej??=new Map).has(e)&&(this._$Ej.set(e,o??t??this[e]),r!==!0||o!==void 0)||(this._$AL.has(e)||(this.hasUpdated||s||(t=void 0),this._$AL.set(e,t)),a===!0&&this._$Em!==e&&(this._$Eq??=new Set).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(const[a,r]of this._$Ep)this[a]=r;this._$Ep=void 0}const s=this.constructor.elementProperties;if(s.size>0)for(const[a,r]of s){const{wrapped:o}=r,n=this[a];o!==!0||this._$AL.has(a)||n===void 0||this.C(a,void 0,r,n)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),this._$EO?.forEach(s=>s.hostUpdate?.()),this.update(t)):this._$EM()}catch(s){throw e=!1,this._$EM(),s}e&&this._$AE(t)}willUpdate(e){}_$AE(e){this._$EO?.forEach(t=>t.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&=this._$Eq.forEach(t=>this._$ET(t,this[t])),this._$EM()}updated(e){}firstUpdated(e){}};Xe.elementStyles=[],Xe.shadowRootOptions={mode:"open"},Xe[ct("elementProperties")]=new Map,Xe[ct("finalized")]=new Map,ar?.({ReactiveElement:Xe}),(Kt.reactiveElementVersions??=[]).push("2.1.2");const Ss=globalThis,Xs=i=>i,Nt=Ss.trustedTypes,Zs=Nt?Nt.createPolicy("lit-html",{createHTML:i=>i}):void 0,sa="$lit$",Te=`lit$${Math.random().toFixed(9).slice(2)}$`,ia="?"+Te,rr=`<${ia}>`,je=document,dt=()=>je.createComment(""),ut=i=>i===null||typeof i!="object"&&typeof i!="function",Cs=Array.isArray,or=i=>Cs(i)||typeof i?.[Symbol.iterator]=="function",Yt=`[ 	
\f\r]`,at=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,Qs=/-->/g,Js=/>/g,ze=RegExp(`>|${Yt}(?:([^\\s"'>=/]+)(${Yt}*=${Yt}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),ei=/'/g,ti=/"/g,aa=/^(?:script|style|textarea|title)$/i,ra=i=>(e,...t)=>({_$litType$:i,strings:e,values:t}),q=ra(1),nr=ra(2),Ge=Symbol.for("lit-noChange"),y=Symbol.for("lit-nothing"),si=new WeakMap,He=je.createTreeWalker(je,129);function oa(i,e){if(!Cs(i)||!i.hasOwnProperty("raw"))throw Error("invalid template strings array");return Zs!==void 0?Zs.createHTML(e):e}const lr=(i,e)=>{const t=i.length-1,s=[];let a,r=e===2?"<svg>":e===3?"<math>":"",o=at;for(let n=0;n<t;n++){const l=i[n];let d,u,h=-1,p=0;for(;p<l.length&&(o.lastIndex=p,u=o.exec(l),u!==null);)p=o.lastIndex,o===at?u[1]==="!--"?o=Qs:u[1]!==void 0?o=Js:u[2]!==void 0?(aa.test(u[2])&&(a=RegExp("</"+u[2],"g")),o=ze):u[3]!==void 0&&(o=ze):o===ze?u[0]===">"?(o=a??at,h=-1):u[1]===void 0?h=-2:(h=o.lastIndex-u[2].length,d=u[1],o=u[3]===void 0?ze:u[3]==='"'?ti:ei):o===ti||o===ei?o=ze:o===Qs||o===Js?o=at:(o=ze,a=void 0);const v=o===ze&&i[n+1].startsWith("/>")?" ":"";r+=o===at?l+rr:h>=0?(s.push(d),l.slice(0,h)+sa+l.slice(h)+Te+v):l+Te+(h===-2?n:v)}return[oa(i,r+(i[t]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),s]};class ht{constructor({strings:e,_$litType$:t},s){let a;this.parts=[];let r=0,o=0;const n=e.length-1,l=this.parts,[d,u]=lr(e,t);if(this.el=ht.createElement(d,s),He.currentNode=this.el.content,t===2||t===3){const h=this.el.content.firstChild;h.replaceWith(...h.childNodes)}for(;(a=He.nextNode())!==null&&l.length<n;){if(a.nodeType===1){if(a.hasAttributes())for(const h of a.getAttributeNames())if(h.endsWith(sa)){const p=u[o++],v=a.getAttribute(h).split(Te),g=/([.?@])?(.*)/.exec(p);l.push({type:1,index:r,name:g[2],strings:v,ctor:g[1]==="."?dr:g[1]==="?"?ur:g[1]==="@"?hr:_t}),a.removeAttribute(h)}else h.startsWith(Te)&&(l.push({type:6,index:r}),a.removeAttribute(h));if(aa.test(a.tagName)){const h=a.textContent.split(Te),p=h.length-1;if(p>0){a.textContent=Nt?Nt.emptyScript:"";for(let v=0;v<p;v++)a.append(h[v],dt()),He.nextNode(),l.push({type:2,index:++r});a.append(h[p],dt())}}}else if(a.nodeType===8)if(a.data===ia)l.push({type:2,index:r});else{let h=-1;for(;(h=a.data.indexOf(Te,h+1))!==-1;)l.push({type:7,index:r}),h+=Te.length-1}r++}}static createElement(e,t){const s=je.createElement("template");return s.innerHTML=e,s}}function et(i,e,t=i,s){if(e===Ge)return e;let a=s!==void 0?t._$Co?.[s]:t._$Cl;const r=ut(e)?void 0:e._$litDirective$;return a?.constructor!==r&&(a?._$AO?.(!1),r===void 0?a=void 0:(a=new r(i),a._$AT(i,t,s)),s!==void 0?(t._$Co??=[])[s]=a:t._$Cl=a),a!==void 0&&(e=et(i,a._$AS(i,e.values),a,s)),e}class cr{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:s}=this._$AD,a=(e?.creationScope??je).importNode(t,!0);He.currentNode=a;let r=He.nextNode(),o=0,n=0,l=s[0];for(;l!==void 0;){if(o===l.index){let d;l.type===2?d=new bt(r,r.nextSibling,this,e):l.type===1?d=new l.ctor(r,l.name,l.strings,this,e):l.type===6&&(d=new pr(r,this,e)),this._$AV.push(d),l=s[++n]}o!==l?.index&&(r=He.nextNode(),o++)}return He.currentNode=je,a}p(e){let t=0;for(const s of this._$AV)s!==void 0&&(s.strings!==void 0?(s._$AI(e,s,t),t+=s.strings.length-2):s._$AI(e[t])),t++}}class bt{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,t,s,a){this.type=2,this._$AH=y,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=s,this.options=a,this._$Cv=a?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return t!==void 0&&e?.nodeType===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=et(this,e,t),ut(e)?e===y||e==null||e===""?(this._$AH!==y&&this._$AR(),this._$AH=y):e!==this._$AH&&e!==Ge&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):or(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==y&&ut(this._$AH)?this._$AA.nextSibling.data=e:this.T(je.createTextNode(e)),this._$AH=e}$(e){const{values:t,_$litType$:s}=e,a=typeof s=="number"?this._$AC(e):(s.el===void 0&&(s.el=ht.createElement(oa(s.h,s.h[0]),this.options)),s);if(this._$AH?._$AD===a)this._$AH.p(t);else{const r=new cr(a,this),o=r.u(this.options);r.p(t),this.T(o),this._$AH=r}}_$AC(e){let t=si.get(e.strings);return t===void 0&&si.set(e.strings,t=new ht(e)),t}k(e){Cs(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let s,a=0;for(const r of e)a===t.length?t.push(s=new bt(this.O(dt()),this.O(dt()),this,this.options)):s=t[a],s._$AI(r),a++;a<t.length&&(this._$AR(s&&s._$AB.nextSibling,a),t.length=a)}_$AR(e=this._$AA.nextSibling,t){for(this._$AP?.(!1,!0,t);e!==this._$AB;){const s=Xs(e).nextSibling;Xs(e).remove(),e=s}}setConnected(e){this._$AM===void 0&&(this._$Cv=e,this._$AP?.(e))}}class _t{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,s,a,r){this.type=1,this._$AH=y,this._$AN=void 0,this.element=e,this.name=t,this._$AM=a,this.options=r,s.length>2||s[0]!==""||s[1]!==""?(this._$AH=Array(s.length-1).fill(new String),this.strings=s):this._$AH=y}_$AI(e,t=this,s,a){const r=this.strings;let o=!1;if(r===void 0)e=et(this,e,t,0),o=!ut(e)||e!==this._$AH&&e!==Ge,o&&(this._$AH=e);else{const n=e;let l,d;for(e=r[0],l=0;l<r.length-1;l++)d=et(this,n[s+l],t,l),d===Ge&&(d=this._$AH[l]),o||=!ut(d)||d!==this._$AH[l],d===y?e=y:e!==y&&(e+=(d??"")+r[l+1]),this._$AH[l]=d}o&&!a&&this.j(e)}j(e){e===y?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class dr extends _t{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===y?void 0:e}}class ur extends _t{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==y)}}class hr extends _t{constructor(e,t,s,a,r){super(e,t,s,a,r),this.type=5}_$AI(e,t=this){if((e=et(this,e,t,0)??y)===Ge)return;const s=this._$AH,a=e===y&&s!==y||e.capture!==s.capture||e.once!==s.once||e.passive!==s.passive,r=e!==y&&(s===y||a);a&&this.element.removeEventListener(this.name,this,s),r&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}}class pr{constructor(e,t,s){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=s}get _$AU(){return this._$AM._$AU}_$AI(e){et(this,e)}}const mr=Ss.litHtmlPolyfillSupport;mr?.(ht,bt),(Ss.litHtmlVersions??=[]).push("3.3.2");const vr=(i,e,t)=>{const s=t?.renderBefore??e;let a=s._$litPart$;if(a===void 0){const r=t?.renderBefore??null;s._$litPart$=a=new bt(e.insertBefore(dt(),r),r,void 0,t??{})}return a._$AI(i),a};const Es=globalThis;let ve=class extends Xe{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){const e=super.createRenderRoot();return this.renderOptions.renderBefore??=e.firstChild,e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=vr(t,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return Ge}};ve._$litElement$=!0,ve.finalized=!0,Es.litElementHydrateSupport?.({LitElement:ve});const fr=Es.litElementPolyfillSupport;fr?.({LitElement:ve});(Es.litElementVersions??=[]).push("4.2.2");const br="@unocss;",gr=ea(br),ii=(i,e,t)=>{const s=i.filter(a=>e.has(a));return t==="single"?s.slice(0,1):[...new Set(s)]},na=(i,e,t,s)=>{if(!s.has(e))return[...i];if(t==="single")return[e];const a=new Set(i);return a.has(e)?a.delete(e):a.add(e),[...a]},la=(i,e)=>e.has(i)?[i]:[],yr=(i,e,t)=>{const s=i.indexOf(e),a=i.indexOf(t);if(s<0||a<0)return[];const r=Math.min(s,a),o=Math.max(s,a);return i.slice(r,o+1)};let ca=function(i){var e=[].slice.call(arguments,1);let t=ge[ge.length-1];return t.pubs=[ge[ge.length-2]],Pe(()=>t.state=[],"cleanup"),t.state=[...t.state,{params:e,payload:i(...e)}]},da=i=>ha(i)&&!i.__reatom.reactive,xr=i=>e=>{const t=e.__reatom.middlewares.indexOf(ca);if(!da(e)||t===-1)throw new $e("withActionMiddleware can only be applied to actions");return e.__reatom.middlewares.splice(t,0,i(e)),e},c=(i,e=Ls("action",i.name))=>{if(typeof i!="function")throw new $e("function expected");let t=Os({initState:[],computed:i},e);return Object.assign(t.__reatom,{reactive:!1,middlewares:[ca]}),zt.length===0?t:t.extend(...zt)};const ot=()=>{},Mt=i=>i,wr=i=>typeof i=="object"&&i!==null,$r=Object.assign,kr=Object.prototype.toString;let Ir=0;const As=i=>{let e;return i instanceof Error!=0&&i.name==="AbortError"||(i instanceof Error?(e={cause:i},i=i.message):i=wr(i)?kr.call(i):String(i),i+=` [#${++Ir}]`,typeof DOMException>"u"?(i=new Error(i,e)).name="AbortError":i=$r(new DOMException(i,"AbortError"),e)),i},Sr=i=>{if(i?.signal.aborted)throw As(i.signal.reason)},Ds=i=>i instanceof Error&&i.name==="AbortError",ai=(i="",e)=>{throw As(i)};let ua=i=>i;class $e extends Error{}function Ut(i){try{return ge.push(this),i(...[].slice.call(arguments,1))}finally{ge.pop()}}let hs=i=>{let e=i.pubs.length===1?[null]:i.pubs.slice();return e[0]=null,(i={error:i.error,state:i.state,"var#abort":void 0,atom:i.atom,pubs:e,subs:i.subs,run:Ut,root:i.root}).root.store.set(i.atom,i),i},ha=i=>typeof i=="function"&&"__reatom"in i,ps=i=>{for(let e=0;e<i.subs.length;e++){let t=i.subs[e];if(t.__reatom.processing&&Pe(()=>{hs(i.root.store.get(t)).pubs.splice(1)},"compute"),t===i.atom)Pe(t,"compute");else{let s=i.root.store.get(t);s.pubs[0]!==null?ps(hs(s)):t.__reatom.processing&&ps(s)}}},ms=i=>{let{pubs:e,atom:t}=i;for(let s=1;s<e.length;s++){let a=e[s];a.subs.push(t)===1&&(a.atom.__reatom.onConnect!==void 0&&Pe(a.atom.__reatom.onConnect,"effect"),ms(a))}},Vt=(i,e)=>{for(let t=e.length-1;t>0;t--){let s=e[t],a=s.subs.lastIndexOf(i);if(a!==-1)if(s.subs.length===1)s.subs.pop(),s.atom.__reatom.onConnect!==void 0&&Pe(s.atom.__reatom.onConnect.abort,"effect"),Vt(s.atom,s.pubs);else if(a===s.subs.length-1)s.subs.pop();else{let r=s.subs.findLastIndex(o=>o!==i);r===-1&&(r=a),s.subs[a]=s.subs[r],s.subs.splice(r,1)}}},pa=(i,e)=>{if(e.length!==i.pubs.length)ms(i),Vt(i.atom,e);else for(let t=1;t<e.length;t++)if(e[t].atom!==i.pubs[t].atom){ms(i),Vt(i.atom,e);break}};function Cr(i){if(typeof i!="function")throw new $e("function expected")}let Er=(i,e)=>{let t=e.root.store.get(i);return t===void 0&&(t={error:null,state:[],"var#abort":void 0,atom:i,pubs:[e.root.frame],subs:[],run:Ut,root:e.root},e.root.store.set(i,t)),e.pubs.push(t),t};function Ar(i){let e=!1;if(da(this)&&(e=!0,i??=ot),i!==void 0)return ae(()=>{if(e){const a=we(),r=Er(this,a);i(r.state)}else i(this())},`${this.name}._subscribe`).subscribe();let t=we().root.frame;try{t.run(this)}catch(a){if(!(a instanceof Promise||Ds(a)))throw a}let s=t.state.store.get(this);return s.subs.push(this)===1&&(s.atom.__reatom.onConnect!==void 0&&Pe(s.atom.__reatom.onConnect,"effect"),pa(s,[null])),qt(()=>{s&&(s.subs.splice(s.subs.lastIndexOf(this),1),s.subs.length===0&&(s.atom.__reatom.onConnect!==void 0&&Pe(s.atom.__reatom.onConnect.abort,"effect"),Vt(this,t.state.store.get(this).pubs)),s=void 0)},t)}let Dr=0,Ls=(i,e)=>`${e||i}#${++Dr}`;if(globalThis.__REATOM)throw new $e("package duplication");let zt=globalThis.__REATOM=[];function Lr(i,e,t){for(let s=t;s<e.length;s++){let{error:a,state:r,atom:o}=e[s],n=r,l=a,d=i.root.store.get(o);if(d.atom.__reatom.processing&&Object.is(d.state,r))i.pubs.push(e[s]);else{if(d.pubs.length===1||d.pubs[0]!==null&&d.subs.length!==0)n=d.state,l=d.error;else{try{n=o()}catch(u){l=u}d=i.root.store.get(o)}if(!Object.is(r,n)||!Object.is(a,l))return i.pubs=[null],!0;i.pubs.push(d)}}return!1}function Xt(i){let e=ge[ge.length-1],t=arguments.length>1,{state:s,pubs:a}=e,r=a.length!==1,o=i!==ua,n=o&&!r,l=s,d=o&&(a[0]===null||r&&e.subs.length===0)&&(!r||(e.pubs=[null],Lr(e,a,1)));for(;t||d;){if(d){d=!1,e.pubs=[null];try{e.atom.__reatom.linking=!0,e.state=l=i(l),e.error=null}finally{e.atom.__reatom.linking=!1,e.pubs[0]??=e.root.frame,e.subs.length&&pa(e,a)}}if(t){t=!1;let u=arguments[1];l=e.state=typeof u=="function"?u(l):u,e.error=null,e.pubs[0]=ge[ge.length-2],d=n&&!Object.is(s,e.state)}}if(e.error!=null)throw e.error;return l}let Rt=null,ma=(i,e)=>Object.assign(i,{extend:Mr,set(){return Rt=[].slice.call(arguments),i()},subscribe:Ar.bind(i),__reatom:{reactive:e.reactive,initState:e.initState,middlewares:e.middlewares,processing:!1,linking:!1,onConnect:void 0},toString:()=>`[Atom ${i.name}]`,toJSON:i}),Os=(i,e=Ls("atom",i?.computed?.name))=>{let t=i.computed&&Xt.bind(null,i.computed),s=ma(function(){if(s.__reatom.reactive&&!Rt&&arguments.length)throw new $e(`Can't call atom "${e}" with arguments, use .set instead`);let a=s.__reatom.reactive?Rt:arguments,r=a!==null;Rt=null;let{reactive:o,initState:n,middlewares:l}=s.__reatom,d=we(),u=d.root.store.get(s),h=!o||r,p=u===void 0;if(p){if(o&&s.__reatom.processing)throw new $e("Cyclic initialization");if(u={error:null,state:void 0,"var#abort":void 0,atom:s,pubs:[null],subs:[],run:Ut,root:d.root},typeof n=="function")try{ge.push(u),o&&(s.__reatom.processing=!0),u.state=n()}catch($){u.error=$??new $e("Unknown error")}finally{d.atom.__reatom.linking&&d.pubs.push(u),o&&(s.__reatom.processing=!1),ge.pop()}else u.state=n;d.root.store.set(s,u)}let{error:v,state:g}=u,f=g,x=v,m=u.pubs[0]===null,I=u.subs.length!==0;if(!s.__reatom.processing&&(h||m||u.pubs.length!==1&&!I)){ge.push(p||m?u:u=hs(u)),o&&(s.__reatom.processing=!0);e:try{if(t!==void 0&&l.length===1&&l[0]===Xt){f=t.apply(null,r?a:[]),x=null;break e}let $=i.computed??ua;for(let T of l)$=T.bind(null,$);f=$.apply(null,r?a:[]),x=null}catch($){x=$??new $e("Unknown error")}u.error=x,u.state=f,u.pubs[0]??=d.root.frame,!h&&d.atom.__reatom.linking&&d.pubs.push(u),m||!I||Object.is(g,u.state)&&Object.is(v,u.error)||ps(u),s.__reatom.processing=!1,ge.pop()}else d.atom.__reatom.linking&&d.pubs.push(u);if(u.error!=null)throw u.error;return o?u.state:u.state.at(-1).payload},{reactive:!0,initState:i.initState,middlewares:[Xt]});return Object.defineProperty(s,"name",{value:e,writable:!1,enumerable:!1,configurable:!0}),zt.length===0?s:s.extend(...zt)},w=(i,e)=>Os({initState:i},e);function Or(i){if(arguments.length>1)throw new $e("Computed can't accept parameters");return i()}let ae=(i,e)=>(Cr(i),Os({computed:i},e).extend(t=>(t.__reatom.middlewares.push(Or),t.set=void 0,t))),Me=ma(function(){return we().root.frame},{reactive:!1,initState:void 0,middlewares:[]});Me.start=(i=we)=>{let e={error:null,state:{store:new WeakMap,frames:new WeakMap,inits:new WeakMap,memoKey:new WeakMap,hook:[],compute:[],cleanup:[],effect:[],pushQueue(t,s){this[s].push(t)},frame:void 0},"var#abort":void 0,atom:Me,pubs:[null],subs:[],run:Ut,root:void 0};return e.root=e.state,e.state.frame=e,e.run(i)},Me.reset=()=>{let i=Me();(i.root=i.state=Me.start().state).frame=i};let we=()=>{if(ge.length===0)throw new $e("missing async stack");return ge[ge.length-1]},ge=[];ge.push(Me.start());let qt=(i,e=we())=>e.run.bind(e,i);function Mr(){for(let i of[].slice.call(arguments)){let e=i(this);if(this!==e){if(ha(e))throw new $e("extension can not change the atom reference, use middleware instead");if(!e)throw new $e("extension can not return nothing");for(let t in e){if(t in this&&this[t]!==e[t])throw new $e(`extension can not override existing methods: ${t}`);this[t]=e[t]}}}return this}let Pe=(i,e)=>{let t=Me();t.state.hook.length===0&&t.state.compute.length===0&&t.state.cleanup.length===0&&t.state.effect.length===0&&Promise.resolve().then(qt(Rr,t)),t.state.pushQueue(()=>{try{i()}catch(s){console.error("Unhandled error in Reatom queue!"),console.log(s)}},e)},$t=(i,e)=>()=>e<i.length?i[e++]:void 0,Rr=()=>{let{state:i}=Me(),e=[$t(i.hook,0),$t(i.compute,0),$t(i.cleanup,0),$t(i.effect,0)],t=0;for(;t<e.length;){let s=e[t++]();s!==void 0&&(t=0,s())}i.hook=[],i.compute=[],i.cleanup=[],i.effect=[]};class va{constructor(e){var t=this;this._findReactiveStartIndex=0,this.create=void 0,this.name=void 0,this.run=void 0,this.createAndRun=void 0,this.spawn=void 0,this.name=e?.name?`var#${e.name}`:Ls("var"),this.create=e?.create??Mt,this.run=c(function(s,a){if(s===void 0)throw new $e("Variable value cannot be undefined");return we()[t.name]=s,a(...[].slice.call(arguments,2))},`${this.name}.run`),this.createAndRun=c(function(s){return we()[t.name]=t.create(),s(...[].slice.call(arguments,1))},`${this.name}.createAndRun`),this.spawn=c(function(s){return s(...[].slice.call(arguments,1))},`${this.name}.spawn`)}get(e){return this.find(Mt,e)}require(e){let t=this.find(Mt,e);if(t===void 0)throw new $e("Variable is not set");return t}first(e=we()){return e[this.name]}has(e){return this.find(void 0,e)!==void 0}find(e=s=>s,t=we()){let s=e(t[this.name]);if(s!==void 0||t.atom===this.spawn)return s;for(let a=t.atom.__reatom.reactive?this._findReactiveStartIndex:0;a<t.pubs.length;a++){let r=t.pubs[a];if(r!==null&&r.atom!==Me){let o=this.find(e,r);if(o!==void 0)return o}}}set(){return we()[this.name]=this.create(...[].slice.call(arguments))}}let Tr=function(){var i=[].slice.call(arguments);typeof i[0]!="function"&&i.unshift(Mt);let[e,t]=i;if(t==="abort")throw new $e("This name is reserved for internal abort variable");return new va({create:e,name:t})},ri=(i,e=we())=>{let t,s,{root:a}=e;if(typeof i=="function")return Qe.throwIfAborted(e),function(){return e.run(()=>(a!==e.root&&ai("context reset"),Qe.throwIfAborted(e),i(...[].slice.call(arguments))))};i instanceof Promise||(i=Promise.resolve(i));let r=n=>{t&&(t.controller.signal.aborted&&s?.catch(ot),t.unsubscribe()),queueMicrotask(()=>{ge.push(e)}),n(),queueMicrotask(()=>{ge.pop()})},o=!1;return s=new Promise(function(n,l){try{const d=(function(u,h){try{var p=(t=Qe.subscribe(v=>{s&&(r(()=>l(v)),r=ot)}),Promise.resolve(i).then(function(v){a!==e.root&&ai("context reset"),r(()=>n(v))}))}catch(v){return h(v)}return p&&p.then?p.then(void 0,h):p})(0,function(u){Ds(u)&&(o=!0,s?.catch(ot)),r(()=>l(u))});return Promise.resolve(d&&d.then?d.then(function(){}):void 0)}catch(d){return Promise.reject(d)}}),o&&s.catch(ot),s};class oi extends AbortController{constructor(e,t=!1){super(),this.name=void 0,this.spawned=void 0,this.name=e,this.spawned=t}abort(e){super.abort(Ds(e)?e:As(`${this.name} ${String(e)}`))}}class Br extends va{find(e,t){let s;return super.find(a=>(s=e?.(a),!(s===void 0&&!a?.spawned)||void 0),t),s}constructor(){var e;super({name:"abort",create:t=>{let s=new oi(we().atom.name);return t instanceof oi?t:t instanceof AbortController?Object.assign(t,{name:s.name,abort:s.abort,spawned:!1}):s}}),this._findReactiveStartIndex=1,e=this,this.createAndRun.extend(xr(()=>function(t){const s=t(...[].slice.call(arguments,1));return s instanceof Promise?Object.assign(s,{controller:e.require()}):s}))}subscribe(e){let t=we(),s=t["var#abort"]??this.set(),a=new AbortController,r=()=>a.abort(),o=qt(function(n){r(),s.abort(n.reason),e?.(n.reason)},t);return this.find(n=>{if(n?.signal.aborted)throw o(n.signal),s.signal.reason;n?.signal.addEventListener("abort",l=>{o(l.target)},a)}),{controller:s,unsubscribe:r,[Symbol.dispose]:r,[Symbol.asyncDispose]:r,listenerController:a}}throwIfAborted(e){this.find(Sr,e)}}let Qe=new Br,Pr=(i=we())=>{let e=i.root.frames.get(i.atom);return e||i.root.frames.set(i.atom,e={prev:null,next:i}),e.next!==i&&(e.prev=e.next,e.next=i),e.prev};ae(()=>{throw new $e("status is turned off by default, you need to activate it explicitly in options")},"defaultStatus").extend(i=>({reset:c(()=>i(),`${i.name}.reset`)}));let Fr=({frame:i,render:e,rerender:t,mount:s,name:a})=>i.run(()=>{let r,o=!1,n=Tr(),l=w({},`_${a}.props`),d=ae(u=>{let h=we(),p=Pr(h)?.pubs??[null];Pe(()=>p.length=1,"cleanup");let v=l();if(o)return r??=Qe.subscribe(),r.controller.signal.aborted&&(r.unsubscribe(),Qe.set(),r=Qe.subscribe()),r.controller.spawned=!0,h["var#abort"]=r.controller,{result:e(v)};n.set(!0);for(let g=2;g<p.length;g++)p[g].atom();return{result:u?.result}},`_${a}`);return{render:qt(u=>{try{return o=!0,l.set({...u}),d()}finally{o=!1}},i),mount:ri(()=>{s?.();let u=d.subscribe(h=>{let p=0;n.find(v=>++p===2?v??!1:v)&&(n.set(!1),t(h))});return ri(()=>{u(),r.controller.abort("unmount")})},i)}});const Nr=1e-9,ni=i=>{const e=i.toString().toLowerCase(),t=e.match(/e-(\d+)$/);if(t?.[1])return Number.parseInt(t[1],10);const s=e.indexOf(".");return s<0?0:e.length-s-1},fa=(i,e)=>Number(i.toFixed(Math.min(Math.max(e,0),12))),li=(i,e)=>i==null||!Number.isFinite(i)||i<=0?e:i,ba=({min:i,max:e,step:t,largeStep:s})=>{const a=Math.min(i,e),r=Math.max(i,e),o=li(t,1),n=r-a,l=Math.max(o,n/10);return{min:a,max:r,step:o,largeStep:li(s,l)}},tt=(i,e,t)=>{const s=Math.min(e,t),a=Math.max(e,t);return i<s?s:i>a?a:i},Ae=(i,e)=>{const s=(tt(i,e.min,e.max)-e.min)/e.step,a=e.min+Math.round(s)*e.step,r=Math.max(ni(e.min),ni(e.step));return tt(fa(a,r+2),e.min,e.max)},ci=(i,e)=>Ae(i,e),Vr=(i,e,t)=>{const s=Math.min(e,t),a=Math.max(e,t),r=a-s;if(r<=Nr)return 0;const o=tt(i,s,a);return fa((o-s)/r*100,4)},ga=(i,e)=>{const t=Ae(i,e)+e.step;return Ae(t,e)},ya=(i,e)=>{const t=Ae(i,e)-e.step;return Ae(t,e)},xa=(i,e)=>{const t=Ae(i,e)+e.largeStep;return Ae(t,e)},wa=(i,e)=>{const t=Ae(i,e)-e.largeStep;return Ae(t,e)};function Ms(i){const e=i.idBase??"value-range",t=ba(i),s=w(t.min,`${e}.min`),a=w(t.max,`${e}.max`),r=w(t.step,`${e}.step`),o=w(t.largeStep,`${e}.largeStep`),n=()=>({min:s(),max:a(),step:r(),largeStep:o()}),l=w(ci(i.initialValue??t.min,n()),`${e}.value`),d=ae(()=>Vr(l(),s(),a()),`${e}.percentage`),u=c(I=>{l.set(ci(I,n()))},`${e}.setValue`),h=c(()=>{l.set(ga(l(),n()))},`${e}.increment`),p=c(()=>{l.set(ya(l(),n()))},`${e}.decrement`),v=c(()=>{l.set(xa(l(),n()))},`${e}.incrementLarge`),g=c(()=>{l.set(wa(l(),n()))},`${e}.decrementLarge`),f=c(()=>{l.set(s())},`${e}.setFirst`),x=c(()=>{l.set(a())},`${e}.setLast`);return{state:{value:l,min:s,max:a,step:r,largeStep:o,percentage:d},actions:{setValue:u,increment:h,decrement:p,incrementLarge:v,decrementLarge:g,setFirst:f,setLast:x}}}const zr=i=>(i.ctrlKey||i.metaKey)&&i.key.toLocaleLowerCase()==="a";function gt(i,e){const t=e.orientation==="horizontal"?"ArrowRight":"ArrowDown",s=e.orientation==="horizontal"?"ArrowLeft":"ArrowUp",a=e.selectionMode==="multiple"&&e.rangeSelectionEnabled;return i.key===t?a&&i.shiftKey?"RANGE_NEXT":"NAV_NEXT":i.key===s?a&&i.shiftKey?"RANGE_PREV":"NAV_PREV":i.key==="Home"?"NAV_FIRST":i.key==="End"?"NAV_LAST":i.key==="Escape"?"DISMISS":i.key===" "||i.key==="Spacebar"?a&&i.shiftKey?"RANGE_SELECT_ACTIVE":"TOGGLE_SELECTION":i.key==="Enter"?"ACTIVATE":e.selectionMode==="multiple"&&zr(i)?"SELECT_ALL":null}const Fe=i=>i.trim().toLocaleLowerCase(),st=()=>({buffer:"",lastInputAt:0}),Kr=i=>i.length>0&&[...i].every(e=>e===i[0]),pt=i=>i.key.length!==1||i.key===" "||i.ctrlKey||i.metaKey||i.altKey?!1:Fe(i.key).length>0,Ht=(i,e,t,s)=>{const a=Fe(e),n=`${t-i.lastInputAt>s?"":i.buffer}${a}`;return{query:Kr(n)?a:n,next:{buffer:n,lastInputAt:t}}},mt=(i,e,t)=>{if(i.length===0||e.length===0)return null;for(let s=0;s<e.length;s+=1){const a=(t+s)%e.length,r=e[a];if(r!=null&&r.text.startsWith(i))return r.id}return null},di=i=>i.filter(e=>!e.disabled).map(e=>e.id),_r=(i,e,t,s)=>{if(t<=0)return-1;if(s==="wrap")return(i+e+t)%t;const a=i+e;return a<0?0:a>=t?t-1:a},Ur=(i,e)=>{if(i.ctrlKey||i.metaKey||i.altKey)return null;const t=e.orientation==="horizontal"?"ArrowRight":"ArrowDown",s=e.orientation==="horizontal"?"ArrowLeft":"ArrowUp";if(i.key===t)return"NAV_NEXT";if(i.key===s)return"NAV_PREV";if(e.homeEndEnabled!==!1){if(i.key==="Home")return"NAV_FIRST";if(i.key==="End")return"NAV_LAST"}return null};function Rs(i){const e=i.idBase??"composite-nav",t=i.orientation??"horizontal",s=i.focusStrategy??"roving-tabindex",a=i.wrapMode??"wrap",r=w([...i.items],`${e}.items`),o=ae(()=>di(r()),`${e}.enabledIds`),l=w((()=>{const A=di(i.items);return i.initialActiveId!=null&&A.includes(i.initialActiveId)?i.initialActiveId:A[0]??null})(),`${e}.activeId`),d=A=>`${e}-item-${A}`,u=ae(()=>{const A=l();return A==null?null:d(A)},`${e}.activeDomId`),h=()=>{const A=o();if(A.length===0){l.set(null);return}const N=l();(N==null||!A.includes(N))&&l.set(A[0]??null)},p=A=>{const N=o();if(N.length===0){l.set(null);return}const k=l();if(k==null||!N.includes(k)){l.set(A===-1?N[N.length-1]??null:N[0]??null);return}const S=N.indexOf(k),E=_r(S,A,N.length,a);l.set(N[E]??null)},v=c(A=>{r.set([...A]),h()},`${e}.setItems`),g=c(A=>{if(A==null){l.set(null);return}o().includes(A)&&l.set(A)},`${e}.setActive`),f=c(()=>{p(1)},`${e}.moveNext`),x=c(()=>{p(-1)},`${e}.movePrev`),m=c(()=>{l.set(o()[0]??null)},`${e}.moveFirst`),I=c(()=>{const A=o();l.set(A[A.length-1]??null)},`${e}.moveLast`),$=c(A=>{switch(Ur(A,{orientation:t})){case"NAV_NEXT":f();return;case"NAV_PREV":x();return;case"NAV_FIRST":m();return;case"NAV_LAST":I();return;default:return}},`${e}.handleKeyDown`);return{state:{items:r,activeId:l,enabledIds:o,activeDomId:u,orientation:t,focusStrategy:s,wrapMode:a},actions:{setItems:v,setActive:g,moveNext:f,movePrev:x,moveFirst:m,moveLast:I,handleKeyDown:$},contracts:{getContainerFocusProps(){return{tabindex:s==="aria-activedescendant"?"0":"-1","aria-activedescendant":s==="aria-activedescendant"?u()??void 0:void 0}},getItemFocusProps(A){const N=r().find(S=>S.id===A);if(!N)throw new Error(`Unknown composite navigation item id: ${A}`);const k=l()===A;return{id:d(A),tabindex:s==="roving-tabindex"&&k?"0":"-1","aria-disabled":N.disabled?"true":void 0,"data-active":k?"true":"false"}}}}}const qr=i=>i.key==="Escape"?"escape":null,Hr=(i,e)=>i&&e;function $a(i={}){const e=i.idBase??"overlay-focus",t=i.trapFocus??!0,s=i.restoreFocus??!0,a=w(i.initialOpen??!1,`${e}.isOpen`),r=w(null,`${e}.openedBy`),o=w(i.initialTriggerId??null,`${e}.triggerId`),n=w(null,`${e}.restoreTargetId`),l=w(null,`${e}.lastDismissIntent`),d=w(!1,`${e}.forceTrap`),u=ae(()=>Hr(a(),t||d()),`${e}.isFocusTrapped`),h=c(B=>{o.set(B)},`${e}.setTrigger`),p=c((B="programmatic",A=o())=>{A!=null&&o.set(A),l.set(null),n.set(null),r.set(B),a.set(!0)},`${e}.open`),v=c((B="programmatic")=>{if(!a()){l.set(B);return}a.set(!1),r.set(null),l.set(B),s&&n.set(o())},`${e}.close`),g=c(B=>{v(B)},`${e}.dismiss`),f=c(()=>{d.set(!0)},`${e}.trap`),x=c(()=>{d.set(!1),n.set(null)},`${e}.restore`),m=c(B=>{const A=qr(B);A!=null&&g(A)},`${e}.handleKeyDown`),I=c(()=>{a()&&g("outside-pointer")},`${e}.handleOutsidePointer`),$=c(()=>{a()&&g("outside-focus")},`${e}.handleOutsideFocus`);return{state:{isOpen:a,openedBy:r,triggerId:o,restoreTargetId:n,lastDismissIntent:l,isFocusTrapped:u,shouldRestoreFocus:s},actions:{setTrigger:h,open:p,close:v,dismiss:g,trap:f,restore:x,handleKeyDown:m,handleOutsidePointer:I,handleOutsideFocus:$}}}function ka(i){const e=i.selectionMode??"single",t=i.focusStrategy??"aria-activedescendant",s=i.selectionFollowsFocus??!1,a=i.rangeSelection===!0||typeof i.rangeSelection=="object"&&i.rangeSelection.enabled!==!1,r=i.orientation??"vertical",o=i.idBase??"lb",n=i.typeahead!==!1&&!(typeof i.typeahead=="object"&&i.typeahead.enabled===!1),l=typeof i.typeahead=="object"&&i.typeahead.timeoutMs!=null?Math.max(0,i.typeahead.timeoutMs):500,d=i.groups??[],u=new Map(d.map(W=>[W.id,W])),h=new Map(i.options.map(W=>[W.id,W])),p=new Map(i.options.map(W=>[W.id,Fe(W.label??W.id)])),v=i.options.map(W=>W.id),g=v.length,f=new Map(v.map((W,ne)=>[W,ne+1])),x=i.options.filter(W=>!W.disabled).map(W=>W.id),m=new Set(x),I=x.map(W=>({id:W,text:p.get(W)??""}));let $=st();const _=w((()=>{if(i.initialActiveId!=null&&m.has(i.initialActiveId))return i.initialActiveId;const W=ii(i.initialSelectedIds??[],m,e)[0];return W??x[0]??null})(),`${o}.activeId`),B=w(ii(i.initialSelectedIds??[],m,e),`${o}.selectedIds`),A=w(!1,`${o}.isOpen`),N=ae(()=>B().length>0,`${o}.hasSelection`);let k=B()[0]??_();const S=W=>`${o}-option-${W}`,E=()=>{$=st()},F=W=>{if(W==null){_.set(null);return}const ne=h.get(W);!ne||ne.disabled||(_.set(W),e==="single"&&s&&B.set([W]))},j=(W,ne)=>{const P=yr(x,W,ne);P.length!==0&&B.set(P)},X=(W,ne)=>{let P=W+ne;for(;P>=0&&P<v.length;){const b=v[P];if(b!=null&&m.has(b))return b;P+=ne}return null},oe=W=>{const ne=_();if(ne==null){F(x[0]??null);return}const P=v.indexOf(ne);if(P<0){F(x[0]??null);return}const b=X(P,W);b!=null&&F(b)},Z=W=>{if(!n||!pt(W))return!1;const ne=Date.now(),{query:P,next:b}=Ht($,Fe(W.key),ne,l),R=_(),J=R==null?-1:x.indexOf(R),ee=J<0?0:(J+1)%x.length,pe=mt(P,I,ee);return pe!=null&&F(pe),$=b,!0},le=c(()=>{A.set(!0),E()},`${o}.open`),z=c(()=>{A.set(!1),E()},`${o}.close`),O=c(W=>{F(W)},`${o}.setActive`),M=c(()=>{oe(1)},`${o}.moveNext`),G=c(()=>{oe(-1)},`${o}.movePrev`),K=c(()=>{F(x[0]??null)},`${o}.moveFirst`),D=c(()=>{F(x[x.length-1]??null)},`${o}.moveLast`),C=c(W=>{if(!m.has(W))return;const ne=na(B(),W,e,m);B.set(ne),k=W},`${o}.toggleSelected`),H=c(W=>{const ne=la(W,m);ne.length!==0&&(B.set(ne),k=W)},`${o}.selectOnly`),Y=c(()=>{B.set([]),k=null},`${o}.clearSelected`),re=c(W=>{if(Z(W))return;E();const ne=gt(W,{orientation:r,selectionMode:e,rangeSelectionEnabled:a});if(ne==null)return;const P=_();switch(ne){case"NAV_NEXT":M();return;case"NAV_PREV":G();return;case"NAV_FIRST":K();return;case"NAV_LAST":D();return;case"DISMISS":z();return;case"RANGE_NEXT":{const b=_();M();const R=_();if(R==null)return;k=k??b??R,k!=null&&j(k,R);return}case"RANGE_PREV":{const b=_();G();const R=_();if(R==null)return;k=k??b??R,k!=null&&j(k,R);return}case"RANGE_SELECT_ACTIVE":if(P==null)return;k=k??P,k!=null&&j(k,P);return;case"TOGGLE_SELECTION":if(P==null)return;C(P);return;case"ACTIVATE":if(P==null)return;e==="multiple"?C(P):H(P);return;case"SELECT_ALL":B.set([...x]),k=_()??x[0]??null;return}},`${o}.handleKeyDown`),me={open:le,close:z,setActive:O,moveNext:M,movePrev:G,moveFirst:K,moveLast:D,toggleSelected:C,selectOnly:H,clearSelected:Y,handleKeyDown:re},fe=new Map;for(const W of i.options)if(W.groupId!=null&&u.has(W.groupId)){let ne=fe.get(W.groupId);ne||(ne=[],fe.set(W.groupId,ne)),ne.push(W)}return{state:{activeId:_,selectedIds:B,isOpen:A,hasSelection:N,selectionMode:e,focusStrategy:t,orientation:r,optionCount:g,groups:d},actions:me,contracts:{getRootProps(){const W=_(),ne={role:"listbox",tabindex:t==="aria-activedescendant"?"0":"-1","aria-label":i.ariaLabel,"aria-orientation":r};return e==="multiple"&&(ne["aria-multiselectable"]="true"),t==="aria-activedescendant"&&W!=null&&(ne["aria-activedescendant"]=S(W)),ne},getOptionProps(W){const ne=h.get(W);if(!ne)throw new Error(`Unknown listbox option id: ${W}`);const P=B(),b=_(),R=P.includes(W),J=b===W,ee=t==="roving-tabindex"&&J?"0":"-1";return{id:S(W),role:"option",tabindex:ee,"aria-disabled":ne.disabled?"true":void 0,"aria-selected":R?"true":"false","aria-setsize":String(g),"aria-posinset":String(f.get(W)),"data-active":J?"true":"false"}},getGroupProps(W){if(!u.get(W))throw new Error(`Unknown listbox group id: ${W}`);return{id:W,role:"group","aria-labelledby":`${o}-group-${W}-label`}},getGroupLabelProps(W){if(!u.get(W))throw new Error(`Unknown listbox group id: ${W}`);return{id:`${o}-group-${W}-label`,role:"presentation"}},getGroupOptions(W){return fe.get(W)??[]},getUngroupedOptions(){return i.options.filter(W=>W.groupId==null||!u.has(W.groupId))}}}}const ui=i=>i.trim().toLocaleLowerCase(),jr=i=>(e,t)=>{const s=ui(t);if(s.length===0)return!0;const a=ui(e.label);return i==="startsWith"?a.startsWith(s):a.includes(s)};function Tt(i){return"options"in i&&Array.isArray(i.options)}function Gr(i){const e=[];for(const t of i)Tt(t)?e.push(...t.options):e.push(t);return e}function Ia(i){const e=i.idBase??"cb",t=i.type??"editable",s=i.multiple??!1,a=i.closeOnSelect??!s,r=i.matchMode??"includes",o=i.filter??jr(r),n=t==="select-only",l=Gr(i.options),d=new Map(l.map(U=>[U.id,U])),u=new Map;for(const U of i.options)Tt(U)&&u.set(U.id,U);const h=i.typeahead!==!1&&!(typeof i.typeahead=="object"&&i.typeahead.enabled===!1),p=typeof i.typeahead=="object"&&i.typeahead.timeoutMs!=null?Math.max(0,i.typeahead.timeoutMs):500,v=w(i.initialInputValue??"",`${e}.inputValue`),g=w(i.initialOpen??!1,`${e}.isOpen`),f=w(null,`${e}.activeId`),x=i.initialSelectedIds??(i.initialSelectedId?[i.initialSelectedId]:[]),m=w(x,`${e}.selectedIds`),I=w(x.length>0?x[0]:null,`${e}.selectedId`),$=U=>{m.set(U),I.set(U.length>0?U[0]:null)},T=U=>{I.set(U),m.set(U!=null?[U]:[])},_=ae(()=>m().length>0,`${e}.hasSelection`),B=ae(()=>t,`${e}.type`),A=ae(()=>s,`${e}.multiple`),N=`${e}-input`,k=`${e}-listbox`,S=U=>`${e}-option-${U}`,E=U=>`${e}-group-${U}`,F=U=>`${e}-group-label-${U}`;let j=st();const X=()=>{j=st()},oe=()=>n?l:l.filter(U=>o(U,v())),Z=()=>{const U=v();if(!i.options.some(Tt))return n?[...l]:l.filter(be=>o(be,U));const ue=[];for(const be of i.options)if(Tt(be)){const Se=n?be.options:be.options.filter(De=>o(De,U));Se.length>0&&ue.push({id:be.id,label:be.label,options:Se})}else(n||o(be,U))&&ue.push(be);return ue},le=()=>oe().filter(U=>!U.disabled).map(U=>U.id),z=()=>{const U=le();if(U.length===0){f.set(null);return}const ie=f();ie!=null&&U.includes(ie)||f.set(U[0]??null)},O=U=>{if(U==null){f.set(null);return}const ie=d.get(U);!ie||ie.disabled||!oe().map(be=>be.id).includes(U)||f.set(U)},M=U=>{const ie=le();if(ie.length===0){f.set(null);return}const ue=f();if(ue==null||!ie.includes(ue)){f.set(ie[0]??null);return}const be=ie.indexOf(ue);if(be<0){f.set(ie[0]??null);return}const Se=(be+U+ie.length)%ie.length;f.set(ie[Se]??null)},G=U=>{if(!s)return;const ie=d.get(U);if(!ie||ie.disabled)return;const ue=m();ue.includes(U)?$(ue.filter(be=>be!==U)):$([...ue,U]),f.set(U)},K=U=>{const ie=d.get(U);!ie||ie.disabled||(s?(G(U),n&&v.set("")):(T(U),v.set(ie.label),f.set(U)),a&&g.set(!1))},D=U=>{if(!(n||h)||!pt(U))return!1;const ue=oe().filter(Oe=>!Oe.disabled);if(ue.length===0)return!0;const be=ue.map(Oe=>({id:Oe.id,text:Fe(Oe.label)})),Se=f()==null?-1:ue.findIndex(Oe=>Oe.id===f()),De=Se<0?0:(Se+1)%ue.length,Ee=Date.now(),{query:Re,next:We}=Ht(j,Fe(U.key),Ee,p),Ne=mt(Re,be,De);return Ne!=null&&O(Ne),j=We,!0},C=c(()=>{g.set(!0),X(),z()},`${e}.open`),H=c(()=>{g.set(!1),X()},`${e}.close`),Y=c(U=>{n||(v.set(U),g.set(!0),X(),z())},`${e}.setInputValue`),re=c(U=>{O(U)},`${e}.setActive`),me=c(()=>{g.set(!0),M(1)},`${e}.moveNext`),fe=c(()=>{g.set(!0),M(-1)},`${e}.movePrev`),xe=c(()=>{g.set(!0);const U=le()[0];f.set(U??null)},`${e}.moveFirst`),Ie=c(()=>{g.set(!0);const U=le();f.set(U[U.length-1]??null)},`${e}.moveLast`),W=c(()=>{const U=f();U!=null&&K(U)},`${e}.commitActive`),ne=c(U=>{K(U)},`${e}.select`),P=c(U=>{G(U)},`${e}.toggleOption`),b=c(U=>{const ie=m();ie.includes(U)&&$(ie.filter(ue=>ue!==U))},`${e}.removeSelected`),R=c(()=>{$([])},`${e}.clearSelection`),J=c(()=>{$([]),v.set("")},`${e}.clear`),ee=c(U=>{if(n&&(U.key===" "||U.key==="Spacebar")){g()?W():C();return}if(n&&U.key==="Enter"&&!g()){C();return}if(n&&D(U)||!n&&D(U))return;X();const ie=gt(U,{orientation:"vertical",selectionMode:"single",rangeSelectionEnabled:!1});if(ie!=null)switch(ie){case"NAV_NEXT":me();return;case"NAV_PREV":fe();return;case"NAV_FIRST":xe();return;case"NAV_LAST":Ie();return;case"ACTIVATE":W();return;case"DISMISS":H();return;default:return}},`${e}.handleKeyDown`),pe={open:C,close:H,setInputValue:Y,setActive:re,moveNext:me,movePrev:fe,moveFirst:xe,moveLast:Ie,commitActive:W,select:ne,toggleOption:P,removeSelected:b,clearSelection:R,clear:J,handleKeyDown:ee},V=I();if(V!=null&&!s){const U=d.get(V);U!=null?(v.set(U.label),f.set(U.id)):T(null)}return{state:{inputValue:v,isOpen:g,activeId:f,selectedId:I,selectedIds:m,hasSelection:_,type:B,multiple:A},actions:pe,contracts:{getVisibleOptions:Z,getFlatVisibleOptions:oe,getInputProps(){const U=f(),ie={id:N,role:"combobox",tabindex:"0","aria-haspopup":"listbox","aria-expanded":g()?"true":"false","aria-controls":k,"aria-activedescendant":g()&&U!=null?S(U):void 0,"aria-label":i.ariaLabel};return n||(ie["aria-autocomplete"]="list"),ie},getListboxProps(){const U={id:k,role:"listbox",tabindex:"-1","aria-label":i.ariaLabel};return s&&(U["aria-multiselectable"]="true"),U},getOptionProps(U){const ie=d.get(U);if(!ie)throw new Error(`Unknown combobox option id: ${U}`);const ue=m();return{id:S(U),role:"option",tabindex:"-1","aria-selected":ue.includes(U)?"true":"false","aria-disabled":ie.disabled?"true":void 0,"data-active":f()===U?"true":"false"}},getGroupProps(U){return{id:E(U),role:"group","aria-labelledby":F(U)}},getGroupLabelProps(U){return{id:F(U),role:"presentation"}}}}}const Wr=/^(\d{4})-(\d{2})-(\d{2})$/,Yr=/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})$/,ke=i=>String(i).padStart(2,"0"),Ze=(i,e,t)=>Math.min(t,Math.max(e,i)),Be=i=>{const e=i.match(Wr);if(!e)return null;const t=Number(e[1]),s=Number(e[2]),a=Number(e[3]);if(!Number.isInteger(t)||!Number.isInteger(s)||!Number.isInteger(a)||s<1||s>12||a<1||a>31)return null;const r=new Date(Date.UTC(t,s-1,a,12,0,0,0));return r.getUTCFullYear()!==t||r.getUTCMonth()+1!==s||r.getUTCDate()!==a?null:{year:t,month:s,day:a}},Xr=i=>{const e=i.match(/^(\d{2}):(\d{2})$/);if(!e)return null;const t=Number(e[1]),s=Number(e[2]);return!Number.isInteger(t)||!Number.isInteger(s)||t<0||t>23||s<0||s>59?null:`${ke(t)}:${ke(s)}`},Zr=i=>{const e=i.trim();if(e.length===0)return null;const t=e.match(Yr);if(t){const o=`${t[1]}-${t[2]}-${t[3]}`,n=`${t[4]}:${t[5]}`;return!Be(o)||!Xr(n)?null:{date:o,time:n,full:`${o}T${n}`}}const s=Be(e);if(!s)return null;const a=`${s.year}-${ke(s.month)}-${ke(s.day)}`,r="00:00";return{date:a,time:r,full:`${a}T${r}`}},Qr=i=>`${i.date}T${i.time}`,Jr=(i,e)=>{if(!i)return{date:null,time:null};const t=e(i);return t?{date:t.date,time:t.time}:{date:null,time:null}},Zt=(i,e)=>{let t=i,s=e;for(;s<1;)s+=12,t-=1;for(;s>12;)s-=12,t+=1;return{year:t,month:s}},Sa=i=>`${i.getUTCFullYear()}-${ke(i.getUTCMonth()+1)}-${ke(i.getUTCDate())}`,Qt=i=>{const e=new Date;return i==="utc"?`${e.getUTCFullYear()}-${ke(e.getUTCMonth()+1)}-${ke(e.getUTCDate())}`:`${e.getFullYear()}-${ke(e.getMonth()+1)}-${ke(e.getDate())}`},hi=(i,e)=>{const t=new Date,s=i==="utc"?t.getUTCHours():t.getHours(),a=i==="utc"?t.getUTCMinutes():t.getMinutes(),r=Ze(Math.floor(e),1,60);let o=Math.round(a/r)*r,n=s;return o>=60&&(o=0,n=(n+1)%24),`${ke(n)}:${ke(o)}`},Jt=(i,e)=>{const t=Be(i);if(!t)return null;const s=new Date(Date.UTC(t.year,t.month-1,t.day,12,0,0,0));return s.setUTCDate(s.getUTCDate()+e),Sa(s)},nt=(i,e,t)=>{const s=e?.slice(0,10)??null,a=t?.slice(0,10)??null;return!(s&&i<s||a&&i>a)},rt=(i,e,t)=>!(e&&i<e||t&&i>t),es=(i,e)=>{const t=i.match(/^(\d{1,2}):(\d{1,2})$/);if(!t)return null;let s=Number(t[1]),a=Number(t[2]);if(!Number.isInteger(s)||!Number.isInteger(a)||s<0||s>23||a<0||a>59)return null;const r=Ze(Math.floor(e),1,60);let o=Math.round(a/r)*r;return o>=60&&(o=0,s=(s+1)%24),`${ke(s)}:${ke(o)}`},eo=(i,e,t,s,a)=>{const r=new Date(Date.UTC(i,e-1,1,12,0,0,0)),o=r.getUTCDay(),n=new Date(r);n.setUTCDate(n.getUTCDate()-o);const l=[];for(let d=0;d<42;d+=1){const u=new Date(n);u.setUTCDate(n.getUTCDate()+d);const h=Sa(u),p=u.getUTCMonth()+1,v=p<e?"prev":p>e?"next":"current",g=nt(h,s,a);l.push({date:h,month:v,inRange:g,isToday:h===t,disabled:!g})}return l};function to(i={}){const e=i.idBase??"date-picker",t=i.parseDateTime??(L=>Zr(L)),s=i.formatDateTime??(L=>Qr(L)),a=w(i.locale??"en-US",`${e}.locale`),r=w(i.timeZone??"local",`${e}.timeZone`),o=w(Ze(Math.floor(i.minuteStep??1),1,60),`${e}.minuteStep`),n=Jr(i.value??null,L=>t(L,a())),l=n.date,d=n.time,u=Qt(r()),h=Be(u)??{year:1970,month:1},v=Be(l??u)??h,g=w(l,`${e}.committedDate`),f=w(d,`${e}.committedTime`),x=w(l,`${e}.draftDate`),m=w(d,`${e}.draftTime`),I=w(l&&d?s({date:l,time:d,full:`${l}T${d}`},a()):"",`${e}.inputValue`),$=w(!1,`${e}.isOpen`),T=w(l??u,`${e}.focusedDate`),_=w(v.year,`${e}.displayedYear`),B=w(v.month,`${e}.displayedMonth`),A=w(!1,`${e}.isInputFocused`),N=w(!1,`${e}.isCalendarFocused`),k=w(i.disabled??!1,`${e}.disabled`),S=w(i.readonly??!1,`${e}.readonly`),E=w(i.required??!1,`${e}.required`),F=w(i.placeholder??"Select date and time",`${e}.placeholder`),j=w(i.min??null,`${e}.min`),X=w(i.max??null,`${e}.max`),oe=w(i.hourCycle??24,`${e}.hourCycle`),Z=ae(()=>g()!=null&&f()!=null,`${e}.hasCommittedSelection`),le=ae(()=>x()!=null&&m()!=null,`${e}.hasDraftSelection`),z=ae(()=>{const L=g(),se=f();return L&&se?`${L}T${se}`:null},`${e}.committedValue`),O=ae(()=>{const L=x(),se=m();return L&&se?`${L}T${se}`:null},`${e}.draftValue`),M=ae(()=>t(I(),a()),`${e}.parsedValue`),G=ae(()=>{const L=M();return L?rt(L.full,j(),X()):!1},`${e}.canCommitInput`),K=ae(()=>I().trim().length>0&&!G(),`${e}.inputInvalid`),D=ae(()=>Qt(r()),`${e}.today`),C=ae(()=>eo(_(),B(),D(),j(),X()),`${e}.visibleDays`),H=ae(()=>{const L=$()?x():g();return L?`${e}-day-${L}`:null},`${e}.selectedCellId`),Y=ae(()=>!0,`${e}.isDualCommit`),re=()=>{const L=g(),se=f();if(L&&se){I.set(s({date:L,time:se,full:`${L}T${se}`},a()));return}I.set("")},me=L=>{const se=z();L?(g.set(L.date),f.set(L.time)):(g.set(null),f.set(null));const he=z();se!==he&&i.onCommit?.(he)},fe=L=>{const se=L?Be(L):null;se&&(_.set(se.year),B.set(se.month))},xe=()=>{const L=x()??g()??D();if(L&&nt(L,j(),X())){T.set(L);return}const se=C().find(he=>!he.disabled);T.set(se?.date??null)},Ie=()=>{if(k()||S())return!1;const L=x(),se=m();if(!L||!se)return!1;const he=`${L}T${se}`;if(!rt(he,j(),X()))return!1;const Ce={date:L,time:se,full:he};return me(Ce),I.set(s(Ce,a())),$.set(!1),N.set(!1),T.set(L),!0},W=c(()=>{if(k())return;$.set(!0),N.set(!0);const L=g(),se=f();if(L&&se)x.set(L),m.set(se);else{const he=M();he&&rt(he.full,j(),X())?(x.set(he.date),m.set(he.time)):(x.set(D()),m.set(hi(r(),o())))}fe(x()),xe()},`${e}.open`),ne=c(()=>{$.set(!1),N.set(!1),x.set(g()),m.set(f()),re()},`${e}.close`),P=c(()=>{if($()){ne();return}W()},`${e}.toggle`),b=c(L=>{k()||S()||(I.set(L),i.onInput?.(L))},`${e}.setInputValue`),R=c(()=>{if(k()||S())return;const L=M();L&&rt(L.full,j(),X())&&(me(L),x.set(L.date),m.set(L.time),I.set(s(L,a())),fe(L.date),T.set(L.date),$.set(!1),N.set(!1))},`${e}.commitInput`),J=c(()=>{k()||S()||(me(null),x.set(null),m.set(null),T.set(null),I.set(""),i.onClear?.())},`${e}.clear`),ee=c(L=>{k.set(L),L&&ne()},`${e}.setDisabled`),pe=c(L=>{S.set(L)},`${e}.setReadonly`),V=c(L=>{E.set(L)},`${e}.setRequired`),te=c(L=>{F.set(L)},`${e}.setPlaceholder`),ce=c(L=>{a.set(L),re()},`${e}.setLocale`),U=c(L=>{r.set(L)},`${e}.setTimeZone`),ie=c(L=>{j.set(L)},`${e}.setMin`),ue=c(L=>{X.set(L)},`${e}.setMax`),be=c(L=>{o.set(Ze(Math.floor(L),1,60));const se=m();if(se){const Ce=es(se,o());Ce&&m.set(Ce)}const he=f();if(he){const Ce=es(he,o());Ce&&f.set(Ce)}},`${e}.setMinuteStep`),Se=c(L=>{oe.set(L)},`${e}.setHourCycle`),De=c((L,se)=>{const he=Zt(L,se);_.set(he.year),B.set(he.month),xe()},`${e}.setDisplayedMonth`),Ee=c(L=>{const se=Zt(_(),B()+L);_.set(se.year),B.set(se.month),xe()},`${e}.moveMonth`),Re=c(L=>{const se=Zt(_()+L,B());_.set(se.year),B.set(se.month),xe()},`${e}.moveYear`),We=c(L=>{if(L==null){T.set(null);return}nt(L,j(),X())&&T.set(L)},`${e}.setFocusedDate`),Ne=L=>{const se=T()??x()??g()??D(),he=Jt(se,L);he&&nt(he,j(),X())&&(T.set(he),fe(he))},Oe=c(()=>{Ne(-1)},`${e}.moveFocusPreviousDay`),Ns=c(()=>{Ne(1)},`${e}.moveFocusNextDay`),Vs=c(()=>{Ne(-7)},`${e}.moveFocusPreviousWeek`),zs=c(()=>{Ne(7)},`${e}.moveFocusNextWeek`),yt=c(L=>{k()||S()||nt(L,j(),X())&&(x.set(L),T.set(L))},`${e}.selectDraftDate`),Gt=c(L=>{if(k()||S())return;const se=es(L,o());se&&m.set(se)},`${e}.setDraftTime`),Ga=c(()=>{if(k()||S())return;const L=Qt(r()),se=hi(r(),o());x.set(L),m.set(se),T.set(L),fe(L)},`${e}.jumpToNow`),xt=c(()=>{Ie()},`${e}.commitDraft`),Ks=c(()=>{$()&&(x.set(g()),m.set(f()),T.set(g()),re())},`${e}.cancelDraft`),_s=c(L=>{if(!k()){if(L.key==="Escape"&&$()&&(i.closeOnEscape??!0)){L.preventDefault?.(),ne();return}if(L.key==="Enter"){L.preventDefault?.(),R();return}(L.key==="ArrowDown"||L.key==="ArrowUp"||L.key===" "||L.key==="Spacebar")&&(L.preventDefault?.(),W())}},`${e}.handleInputKeyDown`),Us=c(L=>{L.key==="Escape"&&(i.closeOnEscape??!0)&&(L.preventDefault?.(),ne())},`${e}.handleDialogKeyDown`),qs=c(L=>{if($())switch(L.key){case"ArrowLeft":L.preventDefault?.(),Oe();return;case"ArrowRight":L.preventDefault?.(),Ns();return;case"ArrowUp":L.preventDefault?.(),Vs();return;case"ArrowDown":L.preventDefault?.(),zs();return;case"PageUp":L.preventDefault?.(),L.shiftKey?Re(-1):Ee(-1);return;case"PageDown":L.preventDefault?.(),L.shiftKey?Re(1):Ee(1);return;case"Home":{L.preventDefault?.();const se=T();if(!se)return;const he=Be(se);if(!he)return;const Ve=new Date(Date.UTC(he.year,he.month-1,he.day,12,0,0,0)).getUTCDay(),it=Jt(se,-Ve);it&&We(it);return}case"End":{L.preventDefault?.();const se=T();if(!se)return;const he=Be(se);if(!he)return;const Ve=new Date(Date.UTC(he.year,he.month-1,he.day,12,0,0,0)).getUTCDay(),it=Jt(se,6-Ve);it&&We(it);return}case"Enter":{if(L.preventDefault?.(),L.ctrlKey){xt();return}const se=T();if(!se)return;yt(se);return}case" ":case"Spacebar":{L.preventDefault?.();const se=T();if(!se)return;yt(se);return}case"Escape":(i.closeOnEscape??!0)&&(L.preventDefault?.(),ne());return;default:return}},`${e}.handleCalendarKeyDown`),Wt=c(L=>{if(L.key==="Enter"){L.preventDefault?.(),xt();return}L.key==="Escape"&&(i.closeOnEscape??!0)&&(L.preventDefault?.(),ne())},`${e}.handleTimeKeyDown`),Hs=c(()=>{$()&&ne()},`${e}.handleOutsidePointer`),wt=()=>m()??f()??"00:00",Wa=L=>{const se=L.replace(/\D/g,"");if(se.length===0)return;const he=Ze(Number(se.slice(-2)),0,23),Ve=wt().split(":")[1]??"00";Gt(`${ke(he)}:${Ve}`)},Ya=L=>{const se=L.replace(/\D/g,"");if(se.length===0)return;const he=Ze(Number(se.slice(-2)),0,59),Ve=wt().split(":")[0]??"00";Gt(`${Ve}:${ke(he)}`)};return{state:{inputValue:I,isOpen:$,focusedDate:T,committedDate:g,committedTime:f,draftDate:x,draftTime:m,displayedYear:_,displayedMonth:B,isInputFocused:A,isCalendarFocused:N,disabled:k,readonly:S,required:E,placeholder:F,locale:a,timeZone:r,min:j,max:X,minuteStep:o,hourCycle:oe,isDualCommit:Y,hasCommittedSelection:Z,hasDraftSelection:le,committedValue:z,draftValue:O,parsedValue:M,canCommitInput:G,inputInvalid:K,visibleDays:C,today:D,selectedCellId:H},actions:{open:W,close:ne,toggle:P,setInputValue:b,commitInput:R,clear:J,setDisabled:ee,setReadonly:pe,setRequired:V,setPlaceholder:te,setLocale:ce,setTimeZone:U,setMin:ie,setMax:ue,setMinuteStep:be,setHourCycle:Se,setDisplayedMonth:De,moveMonth:Ee,moveYear:Re,setFocusedDate:We,moveFocusPreviousDay:Oe,moveFocusNextDay:Ns,moveFocusPreviousWeek:Vs,moveFocusNextWeek:zs,selectDraftDate:yt,setDraftTime:Gt,jumpToNow:Ga,commitDraft:xt,cancelDraft:Ks,handleInputKeyDown:_s,handleDialogKeyDown:Us,handleCalendarKeyDown:qs,handleTimeKeyDown:Wt,handleOutsidePointer:Hs},contracts:{getInputProps(){return{id:`${e}-input`,role:"combobox",tabindex:"0",autocomplete:"off",disabled:k(),readonly:S()?!0:void 0,required:E()?!0:void 0,value:I(),placeholder:F(),"aria-haspopup":"dialog","aria-expanded":$()?"true":"false","aria-controls":`${e}-dialog`,"aria-activedescendant":$()?H()??void 0:void 0,"aria-invalid":K()?"true":void 0,"aria-label":i.ariaLabel,onInput:b,onKeyDown:_s,onFocus:()=>{A.set(!0)},onBlur:()=>{A.set(!1)}}},getDialogProps(){return{id:`${e}-dialog`,role:"dialog",tabindex:"-1",hidden:!$(),"aria-modal":"true","aria-label":i.ariaLabel??"Select date and time",onKeyDown:Us,onPointerDownOutside:Hs}},getCalendarGridProps(){return{id:`${e}-grid`,role:"grid",tabindex:"-1","aria-label":"Calendar",onKeyDown:qs}},getCalendarDayProps(L){const se=C().find(Ce=>Ce.date===L),he=!se||se.disabled||k()||S();return{id:`${e}-day-${L}`,role:"gridcell",tabindex:T()===L?"0":"-1","aria-selected":x()===L?"true":"false","aria-disabled":he?"true":void 0,"aria-current":se?.isToday?"date":void 0,"data-date":L,onClick:()=>{yt(L)},onMouseEnter:()=>{We(L)}}},getMonthNavButtonProps(L){return{id:`${e}-month-${L}`,role:"button",tabindex:"0","aria-label":L==="prev"?"Previous month":"Next month",onClick:()=>{Ee(L==="prev"?-1:1)}}},getYearNavButtonProps(L){return{id:`${e}-year-${L}`,role:"button",tabindex:"0","aria-label":L==="prev"?"Previous year":"Next year",onClick:()=>{Re(L==="prev"?-1:1)}}},getHourInputProps(){const[L]=wt().split(":");return{id:`${e}-time-hour`,type:"text",inputmode:"numeric","aria-label":"Hours",value:L??"00",minlength:"2",maxlength:"2",disabled:k(),readonly:S(),onInput:Wa,onKeyDown:Wt}},getMinuteInputProps(){const[,L]=wt().split(":");return{id:`${e}-time-minute`,type:"text",inputmode:"numeric","aria-label":"Minutes",value:L??"00",minlength:"2",maxlength:"2",disabled:k(),readonly:S(),onInput:Ya,onKeyDown:Wt}},getApplyButtonProps(){const L=O(),se=L?rt(L,j(),X()):!1;return{id:`${e}-apply`,role:"button",tabindex:"0","aria-label":"Apply",disabled:k()||S()||!se,onClick:()=>{xt()}}},getCancelButtonProps(){return{id:`${e}-cancel`,role:"button",tabindex:"0","aria-label":"Cancel",disabled:k(),onClick:()=>{Ks()}}},getClearButtonProps(){return{id:`${e}-clear`,role:"button",tabindex:"0","aria-label":"Clear",disabled:k()||S()||!Z(),onClick:()=>{J()}}},getVisibleDays(){return C()}}}}function Ts(i){const e=i.idBase??"menu",t=i.closeOnSelect??!0,s=i.typeahead??!0,a=i.typeaheadTimeout??500,r=i.splitButton??!1,o=new Map(i.items.map(V=>[V.id,V])),n=i.items.filter(V=>!V.disabled).map(V=>V.id),l=new Map((i.groups??[]).map(V=>[V.id,V])),d=new Map,u=new Map,h=new Map,p=(V,te)=>{d.set(V,te);for(const ce of te)u.set(ce.id,ce);h.set(V,te.filter(ce=>!ce.disabled).map(ce=>ce.id))},v=new Set;for(const V of i.items)V.checked&&(V.type==="checkbox"||V.type==="radio")&&v.add(V.id);const g=w(i.initialOpen??!1,`${e}.isOpen`),f=w(null,`${e}.activeId`),x=w(null,`${e}.selectedId`),m=w(null,`${e}.openedBy`),I=ae(()=>x()!=null,`${e}.hasSelection`),$=w(v,`${e}.checkedIds`),T=w(null,`${e}.openSubmenuId`),_=w(null,`${e}.submenuActiveId`);let B=st(),A=null,N=null;const k=`${e}-menu`,S=V=>`${e}-item-${V}`,E=()=>{if(i.initialActiveId!=null&&n.includes(i.initialActiveId)){f.set(i.initialActiveId);return}f.set(n[0]??null)},F=V=>{if(n.length===0){f.set(null);return}const te=f();if(te==null||!n.includes(te)){f.set(n[0]??null);return}const U=(n.indexOf(te)+V+n.length)%n.length;f.set(n[U]??null)},j=V=>{const te=T();if(te==null)return;const ce=h.get(te);if(!ce||ce.length===0)return;const U=_();if(U==null||!ce.includes(U)){_.set(ce[0]??null);return}const ue=(ce.indexOf(U)+V+ce.length)%ce.length;_.set(ce[ue]??null)},X=c((V="programmatic")=>{g.set(!0),m.set(V),T.set(null),_.set(null);const te=f();(te==null||!n.includes(te))&&E()},`${e}.open`),oe=c(()=>{g.set(!1),m.set(null),f.set(null),T.set(null),_.set(null)},`${e}.close`),Z=c((V="programmatic")=>{g()?oe():X(V)},`${e}.toggle`),le=c(V=>{if(V==null){f.set(null);return}n.includes(V)&&f.set(V)},`${e}.setActive`),z=c(()=>{F(1)},`${e}.moveNext`),O=c(()=>{F(-1)},`${e}.movePrev`),M=c(()=>{f.set(n[0]??null)},`${e}.moveFirst`),G=c(()=>{f.set(n[n.length-1]??null)},`${e}.moveLast`),K=V=>V.type==="checkbox"||V.type==="radio",D=V=>{const te=new Set($());if(V.type==="checkbox")te.has(V.id)?te.delete(V.id):te.add(V.id);else if(V.type==="radio"&&V.group){for(const ce of i.items)ce.group===V.group&&ce.type==="radio"&&te.delete(ce.id);for(const[,ce]of d)for(const U of ce)U.group===V.group&&U.type==="radio"&&te.delete(U.id);te.add(V.id)}$.set(te)},C=c(V=>{const te=o.get(V)??u.get(V);if(!(!te||te.disabled)){if(K(te)){D(te),f.set(V);return}x.set(V),f.set(V),t&&oe()}},`${e}.select`),H=c(V=>{const te=o.get(V)??u.get(V);!te||te.disabled||K(te)&&D(te)},`${e}.toggleCheck`),Y=c(V=>{const te=o.get(V);if(!te||!te.hasSubmenu)return;T.set(V);const ce=h.get(V);_.set(ce?.[0]??null)},`${e}.openSubmenu`),re=c(()=>{T.set(null),_.set(null)},`${e}.closeSubmenu`),me=V=>V.filter(te=>!te.disabled&&te.label).map(te=>({id:te.id,text:Fe(te.label)})),fe=c(V=>{if(!s||!g())return;const te=Date.now(),{query:ce,next:U}=Ht(B,V,te,a);B=U;const ie=T();if(ie!=null){const ue=d.get(ie)??[],be=me(ue),Se=_(),De=Se?be.findIndex(Re=>Re.id===Se)+1:0,Ee=mt(ce,be,De%be.length);Ee!=null&&_.set(Ee)}else{const ue=me(i.items),be=f(),Se=be?ue.findIndex(Ee=>Ee.id===be)+1:0,De=mt(ce,ue,Se%ue.length);De!=null&&f.set(De)}},`${e}.handleTypeahead`),xe=c(V=>{if(V.key==="ArrowDown"){X("keyboard"),f.set(n[0]??null);return}if(V.key==="ArrowUp"){X("keyboard"),f.set(n[n.length-1]??null);return}(V.key==="Enter"||V.key===" ")&&Z("keyboard")},`${e}.handleTriggerKeyDown`),Ie=c(V=>{if(!g())return;const te=T()!=null,ce={key:V.key,shiftKey:V.shiftKey??!1,ctrlKey:V.ctrlKey??!1,metaKey:V.metaKey??!1,altKey:V.altKey??!1};if(te){if(V.key==="Escape"){re();return}if(V.key==="ArrowLeft"){re();return}if(V.key==="ArrowDown"){j(1);return}if(V.key==="ArrowUp"){j(-1);return}if(V.key==="Home"){const ie=T();if(ie){const ue=h.get(ie);_.set(ue?.[0]??null)}return}if(V.key==="End"){const ie=T();if(ie){const ue=h.get(ie);_.set(ue?.[ue.length-1]??null)}return}if(V.key==="Enter"||V.key===" "){const ie=_();ie!=null&&C(ie);return}if(pt(ce)){fe(V.key);return}return}if(V.key==="ArrowRight"){const ie=f();ie!=null&&o.get(ie)?.hasSubmenu&&Y(ie);return}if(V.key==="ArrowLeft")return;if(s&&pt(ce)){fe(V.key);return}const U=gt(ce,{orientation:"vertical",selectionMode:"single",rangeSelectionEnabled:!1});if(U!=null)switch(U){case"NAV_NEXT":z();return;case"NAV_PREV":O();return;case"NAV_FIRST":M();return;case"NAV_LAST":G();return;case"ACTIVATE":{const ie=f();ie!=null&&C(ie);return}case"TOGGLE_SELECTION":{const ie=f();ie!=null&&C(ie);return}case"DISMISS":oe();return;default:return}},`${e}.handleMenuKeyDown`),W=()=>{A!=null&&(clearTimeout(A),A=null,N=null)},ne=c(V=>{n.includes(V)&&f.set(V),o.get(V)?.hasSubmenu?(W(),N=V,A=setTimeout(()=>{Y(V),A=null,N=null},200)):(W(),T()!=null&&re())},`${e}.handleItemPointerEnter`),P=c(V=>{N===V&&W()},`${e}.handleItemPointerLeave`),R={open:X,close:oe,toggle:Z,setActive:le,moveNext:z,movePrev:O,moveFirst:M,moveLast:G,select:C,toggleCheck:H,openSubmenu:Y,closeSubmenu:re,handleTypeahead:fe,handleTriggerKeyDown:xe,handleMenuKeyDown:Ie,handleItemPointerEnter:ne,handleItemPointerLeave:P,setSubmenuItems:(V,te)=>{p(V,te)}};g()&&E();const J=V=>V.type==="checkbox"?"menuitemcheckbox":V.type==="radio"?"menuitemradio":"menuitem";return{state:{isOpen:g,activeId:f,selectedId:x,openedBy:m,hasSelection:I,checkedIds:$,openSubmenuId:T,submenuActiveId:_},actions:R,contracts:{getTriggerProps(){return r?this.getSplitDropdownProps():{id:`${e}-trigger`,tabindex:"0","aria-haspopup":"menu","aria-expanded":g()?"true":"false","aria-controls":k,"aria-label":i.ariaLabel}},getMenuProps(){const V=f(),te={id:k,role:"menu",tabindex:"-1","aria-label":i.ariaLabel};return g()&&V!=null&&(te["aria-activedescendant"]=S(V)),te},getItemProps(V){const te=o.get(V);if(!te)throw new Error(`Unknown menu item id: ${V}`);const ce=J(te),U=$(),ie={id:S(V),role:ce,tabindex:"-1","aria-disabled":te.disabled?"true":void 0,"data-active":f()===V?"true":"false"};return(te.type==="checkbox"||te.type==="radio")&&(ie["aria-checked"]=U.has(V)?"true":"false"),te.hasSubmenu&&(ie["aria-haspopup"]="menu",ie["aria-expanded"]=T()===V?"true":"false"),ie},getSubmenuProps(V){const te=o.get(V);return{id:`${e}-submenu-${V}`,role:"menu",tabindex:"-1",hidden:T()!==V,"aria-label":te?.label}},getSubmenuItemProps(V,te){const ce=u.get(te);if(!ce)throw new Error(`Unknown submenu item id: ${te}`);const U=J(ce),ie=$(),ue={id:`${e}-item-${te}`,role:U,tabindex:"-1","aria-disabled":ce.disabled?"true":void 0,"data-active":_()===te?"true":"false"};return(ce.type==="checkbox"||ce.type==="radio")&&(ue["aria-checked"]=ie.has(te)?"true":"false"),ue},getSplitTriggerProps(){if(!r)throw new Error("getSplitTriggerProps requires splitButton option to be true");return{id:`${e}-split-action`,tabindex:"0",role:"button"}},getSplitDropdownProps(){if(!r)throw new Error("getSplitDropdownProps requires splitButton option to be true");return{id:`${e}-split-dropdown`,tabindex:"0",role:"button","aria-haspopup":"menu","aria-expanded":g()?"true":"false","aria-controls":k,"aria-label":i.ariaLabel??"More options"}},getGroupProps(V){const te=l.get(V);return{id:`${e}-group-${V}`,role:"group","aria-label":te?.label}}}}}function so(i){const e=i.idBase??"tabs",t=i.orientation??"horizontal",s=i.activationMode??"automatic",a=new Map(i.tabs.map(S=>[S.id,S])),r=i.tabs.filter(S=>!S.disabled).map(S=>S.id),o=S=>S!=null&&r.includes(S)?S:r[0]??null,n=o(i.initialSelectedTabId),l=o(i.initialActiveTabId??n),d=w(l,`${e}.activeTabId`),u=w(n,`${e}.selectedTabId`);u()==null&&d()!=null&&u.set(d());const h=`${e}-tablist`,p=S=>`${e}-tab-${S}`,v=S=>`${e}-panel-${S}`,g=()=>{s==="automatic"&&d()!=null&&u.set(d())},f=S=>{if(r.length===0){d.set(null);return}const E=d();if(E==null||!r.includes(E)){d.set(r[0]??null),g();return}const j=(r.indexOf(E)+S+r.length)%r.length;d.set(r[j]??null),g()},x=c(S=>{if(S==null){d.set(null);return}r.includes(S)&&(d.set(S),g())},`${e}.setActive`),m=c(S=>{r.includes(S)&&(d.set(S),u.set(S))},`${e}.select`),I=c(()=>{f(1)},`${e}.moveNext`),$=c(()=>{f(-1)},`${e}.movePrev`),T=c(()=>{d.set(r[0]??null),g()},`${e}.moveFirst`),_=c(()=>{d.set(r[r.length-1]??null),g()},`${e}.moveLast`),B=c(S=>{const E=gt(S,{orientation:t,selectionMode:"single",rangeSelectionEnabled:!1});if(E!=null)switch(E){case"NAV_NEXT":I();return;case"NAV_PREV":$();return;case"NAV_FIRST":T();return;case"NAV_LAST":_();return;case"ACTIVATE":case"TOGGLE_SELECTION":{const F=d();F!=null&&m(F);return}default:return}},`${e}.handleKeyDown`);return{state:{activeTabId:d,selectedTabId:u},actions:{setActive:x,select:m,moveNext:I,movePrev:$,moveFirst:T,moveLast:_,handleKeyDown:B},contracts:{getTabListProps(){const S={id:h,role:"tablist","aria-orientation":t};return i.ariaLabel!=null&&(S["aria-label"]=i.ariaLabel),S},getTabProps(S){const E=a.get(S);if(!E)throw new Error(`Unknown tab id: ${S}`);const F=d()===S,j=u()===S,X={id:p(S),role:"tab",tabindex:F?"0":"-1","aria-selected":j?"true":"false","aria-controls":v(S),"data-active":F?"true":"false","data-selected":j?"true":"false"};return E.disabled&&(X["aria-disabled"]="true"),X},getPanelProps(S){if(!a.has(S))throw new Error(`Unknown tab id for panel: ${S}`);const E=u()===S;return{id:v(S),role:"tabpanel",tabindex:E?"0":"-1","aria-labelledby":p(S),hidden:!E}}}}}const pi=(i,e)=>{const t=[];for(const s of i)!e.has(s)||t.includes(s)||t.push(s);return t},io=(i,e)=>{const t=[],s=[...i.get(e)?.childIds??[]];for(;s.length>0;){const a=s.shift();if(!a)continue;t.push(a);const r=i.get(a)?.childIds??[];s.push(...r)}return t},ao=i=>{const e=new Map,t=[],s=(a,r,o)=>{const n=a.length;a.forEach((l,d)=>{const u=(l.children??[]).map(h=>h.id);e.set(l.id,{id:l.id,parentId:r,childIds:u,level:o,posInSet:d+1,setSize:n,disabled:l.disabled===!0}),r==null&&t.push(l.id),(l.children?.length??0)>0&&s(l.children??[],l.id,o+1)})};return s(i,null,1),{metaById:e,rootIds:t}};function mi(i){const e=i.idBase??"tree",t=i.selectionMode??"single",{metaById:s,rootIds:a}=ao(i.nodes),r=[...s.keys()],o=new Set(r),n=r.filter(D=>s.get(D)?.disabled!==!0),l=new Set(n),d=D=>(s.get(D)?.childIds.length??0)>0,u=w(pi(i.initialExpandedIds??[],o).filter(D=>d(D)),`${e}.expandedIds`),h=w(null,`${e}.activeId`),p=w([],`${e}.selectedIds`),v=(D,C)=>{let H=s.get(D)?.parentId??null;for(;H!=null;){if(!C.has(H))return!1;H=s.get(H)?.parentId??null}return!0},g=()=>{const D=new Set(u()),C=[],H=Y=>{if(!s.has(Y)||(C.push(Y),!D.has(Y)))return;const re=s.get(Y)?.childIds??[];for(const me of re)H(me)};for(const Y of a)H(Y);return C},f=()=>g().filter(D=>l.has(D)),x=D=>{if(D==null){h.set(null);return}!l.has(D)||!f().includes(D)||h.set(D)},m=()=>i.initialActiveId!=null&&l.has(i.initialActiveId)&&f().includes(i.initialActiveId)?i.initialActiveId:f()[0]??null;h.set(m());const I=pi(i.initialSelectedIds??[],l);p.set(t==="single"?I.slice(0,1):I);const $=D=>{t==="single"&&D!=null&&l.has(D)&&p.set([D])},T=D=>{const C=f();if(C.length===0){h.set(null);return}const H=h();if(H==null||!C.includes(H)){const fe=C[0]??null;h.set(fe),$(fe);return}const re=(C.indexOf(H)+D+C.length)%C.length,me=C[re]??null;h.set(me),$(me)},_=D=>{if(!d(D))return;u.set(u().filter(Y=>Y!==D));const C=h();if(C==null||C===D)return;io(s,D).includes(C)&&h.set(l.has(D)?D:f()[0]??null)},B=c(D=>{x(D)},`${e}.setActive`),A=c(()=>{T(1)},`${e}.moveNext`),N=c(()=>{T(-1)},`${e}.movePrev`),k=c(()=>{const D=f()[0]??null;h.set(D),$(D)},`${e}.moveFirst`),S=c(()=>{const D=f(),C=D[D.length-1]??null;h.set(C),$(C)},`${e}.moveLast`),E=c(D=>{d(D)&&(u().includes(D)||u.set([...u(),D]))},`${e}.expand`),F=c(D=>{_(D)},`${e}.collapse`),j=c(D=>{d(D)&&(u().includes(D)?_(D):E(D))},`${e}.toggleExpanded`),X=c(()=>{const D=h();D!=null&&E(D)},`${e}.expandActive`),oe=c(()=>{const D=h();D!=null&&F(D)},`${e}.collapseActive`),Z=c(D=>{l.has(D)&&(t==="single"?p.set(la(D,l)):p.set([D]),h.set(D))},`${e}.select`),le=c(D=>{p.set(na(p(),D,t,l)),l.has(D)&&h.set(D)},`${e}.toggleSelected`),z=c(()=>{p.set([])},`${e}.clearSelected`),O=c(D=>{const C=h();if(D.key==="ArrowRight"){if(C==null){k();return}const Y=s.get(C);if(!Y)return;const re=u().includes(C);if(Y.childIds.length>0&&!re){E(C);return}if(Y.childIds.length>0&&re){const me=Y.childIds.find(fe=>l.has(fe));me!=null&&v(me,new Set(u()))&&h.set(me)}return}if(D.key==="ArrowLeft"){if(C==null){k();return}const Y=s.get(C);if(!Y)return;if(Y.childIds.length>0&&u().includes(C)){F(C);return}let re=Y.parentId;for(;re!=null;){if(l.has(re)){h.set(re);return}re=s.get(re)?.parentId??null}return}const H=gt(D,{orientation:"vertical",selectionMode:t,rangeSelectionEnabled:!1});if(H!=null)switch(H){case"NAV_NEXT":A();return;case"NAV_PREV":N();return;case"NAV_FIRST":k();return;case"NAV_LAST":S();return;case"TOGGLE_SELECTION":{const Y=h();Y!=null&&le(Y);return}case"ACTIVATE":{const Y=h();Y!=null&&Z(Y);return}case"SELECT_ALL":t==="multiple"&&p.set([...n]);return;default:return}},`${e}.handleKeyDown`);return{state:{activeId:h,selectedIds:p,expandedIds:u},actions:{setActive:B,moveNext:A,movePrev:N,moveFirst:k,moveLast:S,expand:E,collapse:F,toggleExpanded:j,expandActive:X,collapseActive:oe,select:Z,toggleSelected:le,clearSelected:z,handleKeyDown:O},contracts:{getTreeProps(){return{role:"tree",tabindex:"0","aria-label":i.ariaLabel,"aria-multiselectable":t==="multiple"?"true":void 0}},getItemProps(D){const C=s.get(D);if(!C)throw new Error(`Unknown tree node id: ${D}`);const H=C.childIds.length>0?u().includes(D):void 0;return{id:`${e}-item-${D}`,role:"treeitem",tabindex:h()===D?"0":"-1","aria-level":C.level,"aria-posinset":C.posInSet,"aria-setsize":C.setSize,"aria-expanded":H==null?void 0:H?"true":"false","aria-selected":p().includes(D)?"true":"false","aria-disabled":C.disabled?"true":void 0,"data-active":h()===D?"true":"false","data-expanded":H==null?void 0:H?"true":"false"}},getVisibleNodeIds:g}}}function ro(i={}){const e=i.idBase??"alert",t=i.durationMs,s=i.ariaLive??"assertive",a=i.ariaAtomic??!0,r=w(i.initialVisible??!1,`${e}.isVisible`),o=w(i.initialMessage??"",`${e}.message`),n=`${e}-region`;let l=null;const d=()=>{l!=null&&(clearTimeout(l),l=null)},u=c(()=>{d(),r.set(!1)},`${e}.hide`),p={show:c(f=>{d(),o.set(f),r.set(!0),t!=null&&Number.isFinite(t)&&t>0&&(l=setTimeout(()=>{u()},t))},`${e}.show`),hide:u};return{state:{isVisible:r,message:o},actions:p,contracts:{getAlertProps(){return{id:n,role:"alert","aria-live":s,"aria-atomic":a?"true":"false"}}}}}const oo=i=>{if(i.length===0)return[];let e=-1;return i.forEach((t,s)=>{t.isCurrent&&(e=s)}),e<0&&(e=i.length-1),i.map((t,s)=>({...t,isCurrent:s===e}))};function vi(i){const e=i.idBase??"breadcrumb",t=w(oo(i.items),`${e}.items`),s=ae(()=>t().find(l=>l.isCurrent)?.id??null,`${e}.currentId`),a=l=>`${e}-item-${l}`,r=l=>`${e}-link-${l}`;return{state:{items:t,currentId:s},contracts:{getRootProps(){return{role:"navigation","aria-label":i.ariaLabel??(i.ariaLabelledBy==null?"Breadcrumb":void 0),"aria-labelledby":i.ariaLabelledBy}},getListProps(){return{}},getItemProps(l){const d=t().find(u=>u.id===l);if(!d)throw new Error(`Unknown breadcrumb item id: ${l}`);return{id:a(l),role:void 0,"data-current":d.isCurrent?"true":"false"}},getLinkProps(l){const d=t().find(u=>u.id===l);if(!d)throw new Error(`Unknown breadcrumb item id for link: ${l}`);return{id:r(l),role:"link",href:d.href,"aria-current":d.isCurrent?"page":void 0}},getSeparatorProps(l){if(!t().find(u=>u.id===l))throw new Error(`Unknown breadcrumb item id for separator: ${l}`);return{"aria-hidden":"true"}}}}}function fi(i,e,t){return i==null?w(e,t):typeof i=="function"?i:w(i,t)}function no(i){const e=i.idBase??`landmark-${i.type}`,t=w(i.type,`${e}.type`),s=fi(i.label,null,`${e}.label`),a=fi(i.labelId,null,`${e}.labelId`),r=ae(()=>{const l=s(),d=a();return{role:t(),"aria-label":d==null?l??void 0:void 0,"aria-labelledby":d??void 0}},`${e}.landmarkProps`);return{state:{type:t,label:s,labelId:a},contracts:{getLandmarkProps(){return r()}}}}const Je=(i,e,t)=>i<e?e:i>t?t:i,lo=(i,e,t,s,a)=>{let r=null,o=null,n=null;if(t!=null&&Number.isFinite(t)&&(r=Je(t,i,e)),s!=null&&Number.isFinite(s)&&(o=Je(s,i,e)),r!=null&&o!=null&&r>o){const l=r;r=o,o=l}return a!=null&&Number.isFinite(a)&&(n=Je(a,i,e)),{low:r,high:o,optimum:n}},co=(i,e,t,s)=>{if(e==null&&t==null)return"normal";const a=e!=null&&i<e,r=t!=null&&i>t;if(s!=null){const o=e!=null&&s<e,n=t!=null&&s>t,l=!o&&!n;if(o&&a||n&&r||l&&!a&&!r)return"optimum"}return a?"low":r?"high":"normal"};function uo(i={}){const e=i.idBase??"meter",t=i.min??0,s=i.max??100,a=Math.min(t,s),r=Math.max(t,s),o=w(a,`${e}.min`),n=w(r,`${e}.max`),l=w(Je(i.value??a,a,r),`${e}.value`),d=lo(a,r,i.low,i.high,i.optimum),u=ae(()=>{const f=o(),x=n(),m=x-f;if(m<=0)return 0;const I=Je(l(),f,x);return Number(((I-f)/m*100).toFixed(4))},`${e}.percentage`),h=ae(()=>co(l(),d.low,d.high,d.optimum),`${e}.status`),p={setValue:c(f=>{l.set(Je(f,o(),n()))},`${e}.setValue`)};return{state:{value:l,min:o,max:n,percentage:u,status:h},actions:p,contracts:{getMeterProps(){const f=l();return{id:`${e}-root`,role:"meter","aria-valuenow":String(f),"aria-valuemin":String(o()),"aria-valuemax":String(n()),"aria-valuetext":i.formatValueText?.(f),"aria-label":i.ariaLabel,"aria-labelledby":i.ariaLabelledBy,"aria-describedby":i.ariaDescribedBy}}}}}function ho(i={}){const e=i.idBase??"link",t=i.isSemanticHost??!1,s=c(()=>{i.onPress?.()},`${e}.press`),a=c(d=>{s()},`${e}.handleClick`),r=c(d=>{d.key==="Enter"&&s()},`${e}.handleKeyDown`);return{state:{},actions:{press:s,handleClick:a,handleKeyDown:r},contracts:{getLinkProps(){return{id:`${e}-root`,role:t?void 0:"link",href:i.href,tabindex:t?void 0:"0",onClick:a,onKeyDown:r}}}}}const po=i=>new Map(i.map((e,t)=>[e.id,e.index??t+1])),mo=i=>new Map(i.map((e,t)=>[e.id,e.index??t+1])),ts=(i,e,t)=>Math.min(Math.max(i,e),t);function bi(i){if(!i.ariaLabel&&!i.ariaLabelledBy)throw new Error("Table requires either ariaLabel or ariaLabelledBy for accessibility");const e=i.idBase??"table",t=i.selectable??!1,s=i.interactive??!1,a=Math.max(i.pageSize??10,1),r=new Set(i.columns.map(C=>C.id)),o=new Set(i.rows.map(C=>C.id)),n=i.rows.map(C=>C.id),l=po(i.rows),d=mo(i.columns),u=w(i.initialSortColumnId??null,`${e}.sortColumnId`),h=w(i.initialSortDirection??"none",`${e}.sortDirection`),p=ae(()=>Math.max(i.totalRowCount??i.rows.length,i.rows.length),`${e}.rowCount`),v=ae(()=>Math.max(i.totalColumnCount??i.columns.length,i.columns.length),`${e}.columnCount`),g=c((C,H)=>{if(H==="none"){u.set(null),h.set("none");return}r.has(C)&&(u.set(C),h.set(H))},`${e}.sortBy`),f=c(()=>{u.set(null),h.set("none")},`${e}.clearSort`),m=w((()=>{if(t===!1)return new Set;const C=(i.initialSelectedRowIds??[]).filter(H=>o.has(H));return t==="single"?C.length>0?new Set([C[0]]):new Set:new Set(C)})(),`${e}.selectedRowIds`),I=c(C=>{if(t!==!1&&o.has(C))if(t==="single")m.set(new Set([C]));else{const H=new Set(m());H.add(C),m.set(H)}},`${e}.selectRow`),$=c(C=>{if(t===!1)return;const H=m();if(!H.has(C))return;const Y=new Set(H);Y.delete(C),m.set(Y)},`${e}.deselectRow`),T=c(C=>{if(t===!1||!o.has(C))return;const H=m();if(H.has(C)){const Y=new Set(H);Y.delete(C),m.set(Y)}else if(t==="single")m.set(new Set([C]));else{const Y=new Set(H);Y.add(C),m.set(Y)}},`${e}.toggleRowSelection`),_=c(()=>{t==="multi"&&m.set(new Set(n))},`${e}.selectAllRows`),B=c(()=>{t!==!1&&m.set(new Set)},`${e}.clearSelection`),A=(C,H)=>s?C!=null?ts(C,0,H):0:null,N=w(A(i.initialFocusedRowIndex,i.rows.length-1),`${e}.focusedRowIndex`),k=w(A(i.initialFocusedColumnIndex,i.columns.length-1),`${e}.focusedColumnIndex`),S=c(C=>{if(!s)return;const H=N(),Y=k();if(H==null||Y==null)return;const re=i.rows.length-1,me=i.columns.length-1;switch(C){case"up":N.set(Math.max(0,H-1));break;case"down":N.set(Math.min(re,H+1));break;case"left":k.set(Math.max(0,Y-1));break;case"right":k.set(Math.min(me,Y+1));break}},`${e}.moveFocus`),E=c(()=>{s&&(N.set(0),k.set(0))},`${e}.moveFocusToStart`),F=c(()=>{s&&(N.set(i.rows.length-1),k.set(i.columns.length-1))},`${e}.moveFocusToEnd`),j=c(()=>{s&&k.set(0)},`${e}.moveFocusToRowStart`),X=c(()=>{s&&k.set(i.columns.length-1)},`${e}.moveFocusToRowEnd`),oe=c((C,H)=>{s&&(N.set(ts(C,0,i.rows.length-1)),k.set(ts(H,0,i.columns.length-1)))},`${e}.setFocusedCell`),Z=c(()=>{if(!s)return;const C=N();C!=null&&N.set(Math.max(0,C-a))},`${e}.pageUp`),le=c(()=>{if(!s)return;const C=N();C!=null&&N.set(Math.min(i.rows.length-1,C+a))},`${e}.pageDown`),z=c(C=>{if(!s)return;const H=C.ctrlKey===!0||C.metaKey===!0;switch(C.key){case"ArrowUp":S("up");return;case"ArrowDown":S("down");return;case"ArrowLeft":S("left");return;case"ArrowRight":S("right");return;case"Home":H?E():j();return;case"End":H?F():X();return;case"PageUp":Z();return;case"PageDown":le();return;case" ":{if(t===!1)return;const Y=N();if(Y==null)return;const re=n[Y];re!=null&&T(re);return}case"a":{H&&t==="multi"&&_();return}default:return}},`${e}.handleKeyDown`),O={sortBy:g,clearSort:f,selectRow:I,deselectRow:$,toggleRowSelection:T,selectAllRows:_,clearSelection:B,moveFocus:S,moveFocusToStart:E,moveFocusToEnd:F,moveFocusToRowStart:j,moveFocusToRowEnd:X,setFocusedCell:oe,pageUp:Z,pageDown:le,handleKeyDown:z},M=C=>{const H=n.indexOf(C);return H>=0?H:-1},G=C=>{for(let H=0;H<i.columns.length;H++)if(i.columns[H].id===C)return H;return-1};return{state:{rowCount:p,columnCount:v,sortColumnId:u,sortDirection:h,selectedRowIds:m,focusedRowIndex:N,focusedColumnIndex:k,selectable:t,interactive:s},actions:O,contracts:{getTableProps(){const C={id:`${e}-root`,role:s?"grid":"table","aria-label":i.ariaLabel,"aria-labelledby":i.ariaLabelledBy,"aria-rowcount":p(),"aria-colcount":v()};return t==="multi"&&(C["aria-multiselectable"]="true"),s&&(C.tabindex="0"),C},getRowProps(C){if(!o.has(C))throw new Error(`Unknown table row id: ${C}`);const H={id:`${e}-row-${C}`,role:"row","aria-rowindex":l.get(C)??1};return t!==!1&&(H["aria-selected"]=m().has(C)?"true":"false"),H},getCellProps(C,H,Y){if(!o.has(C))throw new Error(`Unknown table row id for cell: ${C}`);if(!r.has(H))throw new Error(`Unknown table column id for cell: ${H}`);const re={id:`${e}-cell-${C}-${H}`,role:s?"gridcell":"cell","aria-colindex":d.get(H)??1,"aria-colspan":Y?.colspan,"aria-rowspan":Y?.rowspan};if(s){const me=M(C),fe=G(H),xe=N(),Ie=k(),W=me===xe&&fe===Ie;re.tabindex=W?"0":"-1",re["data-active"]=W?"true":"false"}return re},getColumnHeaderProps(C){if(!r.has(C))throw new Error(`Unknown table column id for header: ${C}`);const H=u()===C,Y=h(),re={id:`${e}-column-header-${C}`,role:"columnheader","aria-colindex":d.get(C)??1,"aria-sort":H?Y:"none"};if(s){const me=G(C),fe=k();re.tabindex=fe===me&&N()===null?"0":"-1"}return re},getRowHeaderProps(C,H){if(!o.has(C))throw new Error(`Unknown table row id for row header: ${C}`);if(!r.has(H))throw new Error(`Unknown table column id for row header: ${H}`);return{id:`${e}-row-header-${C}-${H}`,role:"rowheader","aria-rowindex":l.get(C)??1,"aria-colindex":d.get(H)??1}}}}}const gi=i=>i===" "||i==="Spacebar";function vo(i={}){const e=i.idBase??"button",t=i.isPressed!=null,s=w(i.isDisabled??!1,`${e}.isDisabled`),a=w(i.isLoading??!1,`${e}.isLoading`),r=w(i.isPressed??!1,`${e}.isPressed`),o=c(m=>{s.set(m)},`${e}.setDisabled`),n=c(m=>{a.set(m)},`${e}.setLoading`),l=c(m=>{r.set(m)},`${e}.setPressed`),d=()=>s()||a(),u=c(()=>{d()||(t&&r.set(!r()),i.onPress?.())},`${e}.press`),h=c(()=>{u()},`${e}.handleClick`),p=c(m=>{if(!d()){if(m.key==="Enter"){u();return}gi(m.key)&&m.preventDefault?.()}},`${e}.handleKeyDown`),v=c(m=>{d()||gi(m.key)&&u()},`${e}.handleKeyUp`);return{state:{isDisabled:s,isLoading:a,isPressed:r},actions:{setDisabled:o,setLoading:n,setPressed:l,press:u,handleClick:h,handleKeyDown:p,handleKeyUp:v},contracts:{getButtonProps(){const m=s(),I=a(),$=m||I,T=r();return{id:`${e}-root`,role:"button",tabindex:$?"-1":"0","aria-disabled":$?"true":void 0,"aria-busy":I?"true":void 0,"aria-pressed":t?T?"true":"false":void 0,onClick:h,onKeyDown:p,onKeyUp:v}}}}}const yi=(i,e)=>i==="mixed"&&!e?!1:i,fo=i=>i==="mixed"?!0:!i,bo=i=>i==="mixed"?"mixed":i?"true":"false",go=i=>i===" "||i==="Spacebar";function yo(i={}){const e=i.idBase??"checkbox",t=i.allowMixed??i.checked==="mixed",s=w(yi(i.checked??!1,t),`${e}.checked`),a=w(i.isDisabled??!1,`${e}.isDisabled`),r=w(i.isReadOnly??!1,`${e}.isReadOnly`),o=()=>!a()&&!r(),n=c(x=>{const m=yi(x,t);s.set(m),i.onCheckedChange?.(m)},`${e}.setChecked`),l=c(x=>{a.set(x)},`${e}.setDisabled`),d=c(x=>{r.set(x)},`${e}.setReadOnly`),u=c(()=>{o()&&n(fo(s()))},`${e}.toggle`),h=c(()=>{u()},`${e}.handleClick`),p=c(x=>{if(go(x.key)){if(!o())return;x.preventDefault?.(),u()}},`${e}.handleKeyDown`);return{state:{checked:s,isDisabled:a,isReadOnly:r},actions:{setChecked:n,setDisabled:l,setReadOnly:d,toggle:u,handleClick:h,handleKeyDown:p},contracts:{getCheckboxProps(){return{id:`${e}-root`,role:"checkbox",tabindex:a()?"-1":"0","aria-checked":bo(s()),"aria-disabled":a()?"true":void 0,"aria-readonly":r()?"true":void 0,"aria-labelledby":i.ariaLabelledBy,"aria-describedby":i.ariaDescribedBy,onClick:h,onKeyDown:p}}}}}const xo=i=>i===" "||i==="Spacebar";function wo(i={}){const e=i.idBase??"switch",t=w(i.isOn??!1,`${e}.isOn`),s=w(i.isDisabled??!1,`${e}.isDisabled`),a=c(p=>{t.set(p),i.onCheckedChange?.(p)},`${e}.setOn`),r=c(p=>{s.set(p)},`${e}.setDisabled`),o=c(()=>{s()||a(!t())},`${e}.toggle`),n=c(()=>{o()},`${e}.handleClick`),l=c(p=>{s()||(p.key==="Enter"||xo(p.key))&&(p.preventDefault(),o())},`${e}.handleKeyDown`);return{state:{isOn:t,isDisabled:s},actions:{setOn:a,setDisabled:r,toggle:o,handleClick:n,handleKeyDown:l},contracts:{getSwitchProps(){return{id:`${e}-root`,role:"switch",tabindex:s()?"-1":"0","aria-checked":t()?"true":"false","aria-disabled":s()?"true":"false","aria-labelledby":i.ariaLabelledBy,"aria-describedby":i.ariaDescribedBy,onClick:n,onKeyDown:l}}}}}const $o=i=>i===" "||i==="Spacebar";function ko(i){const e=i.idBase??"radio-group",t=i.orientation??"horizontal",s=new Map(i.items.map(B=>[B.id,B])),a=i.items.filter(B=>!B.disabled).map(B=>B.id),o=i.initialValue!=null&&a.includes(i.initialValue)?i.initialValue:null,n=o??(i.initialActiveId!=null&&a.includes(i.initialActiveId)?i.initialActiveId:a[0]??null),l=Rs({idBase:`${e}.nav`,items:i.items,orientation:t,focusStrategy:"roving-tabindex",wrapMode:"wrap",initialActiveId:n}),d=w(o,`${e}.value`),u=w(i.isDisabled??!1,`${e}.isDisabled`),h=()=>{const B=l.state.activeId();B!=null&&d.set(B)},p=c(B=>{u.set(B)},`${e}.setDisabled`),v=c(B=>{u()||l.state.enabledIds().includes(B)&&(l.actions.setActive(B),d.set(B))},`${e}.select`),g=c(()=>{u()||(l.actions.moveNext(),h())},`${e}.moveNext`),f=c(()=>{u()||(l.actions.movePrev(),h())},`${e}.movePrev`),x=c(()=>{u()||(l.actions.moveFirst(),h())},`${e}.moveFirst`),m=c(()=>{u()||(l.actions.moveLast(),h())},`${e}.moveLast`),I=c(B=>{if(!u())switch(B.key){case"ArrowRight":case"ArrowDown":g();return;case"ArrowLeft":case"ArrowUp":f();return;case"Home":x();return;case"End":m();return;default:if($o(B.key)){const A=l.state.activeId();A!=null&&v(A)}}},`${e}.handleKeyDown`),$={setDisabled:p,select:v,moveNext:g,movePrev:f,moveFirst:x,moveLast:m,handleKeyDown:I},T={getRootProps(){return{role:"radiogroup","aria-label":i.ariaLabel,"aria-labelledby":i.ariaLabelledBy,"aria-disabled":u()?"true":void 0,"aria-orientation":t,onKeyDown:I}},getRadioProps(B){const A=s.get(B);if(!A)throw new Error(`Unknown radio id: ${B}`);const N=l.state.activeId(),k=d()===B,S=u()||A.disabled===!0;return{id:`${e}-radio-${B}`,role:"radio",tabindex:N===B&&!S?"0":"-1","aria-checked":k?"true":"false","aria-disabled":S?"true":void 0,"aria-describedby":A.describedBy?`${e}-radio-${B}-desc`:void 0,"data-active":N===B?"true":"false",onClick:()=>v(B),onKeyDown:I}}};return{state:{value:d,activeId:l.state.activeId,isDisabled:u,orientation:t},actions:$,contracts:T}}const Ke=(i,e,t,s)=>{if(i())return;const a=e();t();const r=e();a!==r&&s?.(r)};function Io(i={}){const e=i.idBase??"slider",t=i.orientation??"horizontal",s=w(i.isDisabled??!1,`${e}.isDisabled`),a=Ms({idBase:`${e}.range`,min:i.min??0,max:i.max??100,step:i.step,largeStep:i.largeStep,initialValue:i.value}),r=c(m=>{Ke(s,a.state.value,()=>{a.actions.setValue(m)},i.onValueChange)},`${e}.setValue`),o=c(()=>{Ke(s,a.state.value,()=>{a.actions.increment()},i.onValueChange)},`${e}.increment`),n=c(()=>{Ke(s,a.state.value,()=>{a.actions.decrement()},i.onValueChange)},`${e}.decrement`),l=c(()=>{Ke(s,a.state.value,()=>{a.actions.incrementLarge()},i.onValueChange)},`${e}.incrementLarge`),d=c(()=>{Ke(s,a.state.value,()=>{a.actions.decrementLarge()},i.onValueChange)},`${e}.decrementLarge`),u=c(()=>{Ke(s,a.state.value,()=>{a.actions.setFirst()},i.onValueChange)},`${e}.setFirst`),h=c(()=>{Ke(s,a.state.value,()=>{a.actions.setLast()},i.onValueChange)},`${e}.setLast`),p=c(m=>{s.set(m)},`${e}.setDisabled`),v=c(m=>{if(!s())switch(m.key){case"ArrowRight":case"ArrowUp":o();return;case"ArrowLeft":case"ArrowDown":n();return;case"PageUp":l();return;case"PageDown":d();return;case"Home":u();return;case"End":h();return;default:return}},`${e}.handleKeyDown`),g={setValue:r,increment:o,decrement:n,incrementLarge:l,decrementLarge:d,setFirst:u,setLast:h,setDisabled:p,handleKeyDown:v},f={getRootProps(){return{id:`${e}-root`,"data-orientation":t,"aria-disabled":s()?"true":void 0}},getTrackProps(){return{id:`${e}-track`,"data-orientation":t}},getThumbProps(){const m=a.state.value();return{id:`${e}-thumb`,role:"slider",tabindex:s()?"-1":"0","aria-valuenow":String(m),"aria-valuemin":String(a.state.min()),"aria-valuemax":String(a.state.max()),"aria-valuetext":i.formatValueText?.(m),"aria-orientation":t,"aria-disabled":s()?"true":void 0,"aria-label":i.ariaLabel,"aria-labelledby":i.ariaLabelledBy,"aria-describedby":i.ariaDescribedBy,onKeyDown:v}}};return{state:{value:a.state.value,min:a.state.min,max:a.state.max,step:a.state.step,largeStep:a.state.largeStep,percentage:a.state.percentage,isDisabled:s,orientation:t},actions:g,contracts:f}}const Ca=1e-9,xi=i=>i==null?void 0:String(i),wi=(i,e)=>i==null||!Number.isFinite(i)||i<=0?e:i,$i=i=>{const e=i.toString().toLowerCase(),t=e.match(/e-(\d+)$/);if(t?.[1])return Number.parseInt(t[1],10);const s=e.indexOf(".");return s<0?0:e.length-s-1},So=(i,e)=>Number(i.toFixed(Math.min(Math.max(e,0),12))),Co=(i,e)=>i!=null&&e!=null&&i>e?{min:e,max:i}:{min:i,max:e},Eo=(i,e,t)=>e!=null&&i<e?e:t!=null&&i>t?t:i,Ao=(i,e,t)=>{const s=(i-t)/e,a=t+Math.round(s)*e,r=Math.max($i(t),$i(e));return So(a,r+2)},Do=(i,e)=>e!=null&&i>=e-Ca,Lo=(i,e)=>e!=null&&i<=e+Ca;function Ea(i={}){const e=i.idBase??"spinbutton",t=wi(i.step,1),s=wi(i.largeStep,t*10),a=Co(i.min,i.max),r=w(a.min,`${e}.min`),o=w(a.max,`${e}.max`),n=w(t,`${e}.step`),l=w(s,`${e}.largeStep`),d=O=>{const M=Ao(O,n(),r()??0);return Eo(M,r(),o())},u=Number.isFinite(i.value)?i.value:r()??0,h=d(u),p=w(h,`${e}.value`),v=w(i.isDisabled??!1,`${e}.isDisabled`),g=w(i.isReadOnly??!1,`${e}.isReadOnly`),f=ae(()=>r()!=null,`${e}.hasMinComputed`),x=ae(()=>o()!=null,`${e}.hasMaxComputed`),m=()=>!v()&&!g(),I=O=>{if(!Number.isFinite(O))return;const M=p(),G=d(O);p.set(G),M!==G&&i.onValueChange?.(G)},$=c(O=>{m()&&I(O)},`${e}.setValue`),T=c(()=>{m()&&I(p()+n())},`${e}.increment`),_=c(()=>{m()&&I(p()-n())},`${e}.decrement`),B=c(()=>{m()&&I(p()+l())},`${e}.incrementLarge`),A=c(()=>{m()&&I(p()-l())},`${e}.decrementLarge`),N=c(()=>{!m()||r()==null||I(r())},`${e}.setFirst`),k=c(()=>{!m()||o()==null||I(o())},`${e}.setLast`),S=c(O=>{v.set(O)},`${e}.setDisabled`),E=c(O=>{g.set(O)},`${e}.setReadOnly`),F=c(O=>{switch(O.key){case"ArrowUp":O.preventDefault?.(),T();return;case"ArrowDown":O.preventDefault?.(),_();return;case"PageUp":O.preventDefault?.(),B();return;case"PageDown":O.preventDefault?.(),A();return;case"Home":O.preventDefault?.(),N();return;case"End":O.preventDefault?.(),k();return;default:return}},`${e}.handleKeyDown`),j={setValue:$,increment:T,decrement:_,incrementLarge:B,decrementLarge:A,setFirst:N,setLast:k,setDisabled:S,setReadOnly:E,handleKeyDown:F},X=()=>v()||g(),oe=()=>X()||Do(p(),o()),Z=()=>X()||Lo(p(),r());return{state:{value:p,min:r,max:o,step:n,largeStep:l,isDisabled:v,isReadOnly:g,hasMin:f,hasMax:x},actions:j,contracts:{getSpinbuttonProps(){const O=p();return{id:`${e}-root`,role:"spinbutton",tabindex:v()?"-1":"0","aria-valuenow":String(O),"aria-valuemin":xi(r()),"aria-valuemax":xi(o()),"aria-valuetext":i.formatValueText?.(O),"aria-disabled":v()?"true":void 0,"aria-readonly":g()?"true":void 0,"aria-label":i.ariaLabel,"aria-labelledby":i.ariaLabelledBy,"aria-describedby":i.ariaDescribedBy,onKeyDown:F}},getIncrementButtonProps(){return{id:`${e}-increment`,tabindex:"-1","aria-label":"Increment value","aria-disabled":oe()?"true":void 0,onClick:T}},getDecrementButtonProps(){return{id:`${e}-decrement`,tabindex:"-1","aria-label":"Decrement value","aria-disabled":Z()?"true":void 0,onClick:_}}}}}const Oo=(i,e)=>[...i.map(a=>Ae(a,e))].sort((a,r)=>a-r).map((a,r,o)=>{const n=r===0?e.min:o[r-1]??e.min,l=r===o.length-1?e.max:o[r+1]??e.max;return tt(a,n,l)}),_e=(i,e)=>Number.isInteger(i)&&i>=0&&i<e.length;function Mo(i){const e=i.idBase??"slider-multi-thumb",t=i.orientation??"horizontal",s=ba({min:i.min??0,max:i.max??100,step:i.step,largeStep:i.largeStep}),a=w(s.min,`${e}.min`),r=w(s.max,`${e}.max`),o=w(s.step,`${e}.step`),n=w(s.largeStep,`${e}.largeStep`),l=()=>({min:a(),max:r(),step:o(),largeStep:n()}),d=w(Oo(i.values,l()),`${e}.values`),u=w(i.isDisabled??!1,`${e}.isDisabled`),h=w(i.initialActiveThumbIndex??(d().length>0?0:null),`${e}.activeThumbIndex`),p=(k,S=d())=>{const E=k===0?a():S[k-1]??a(),F=k===S.length-1?r():S[k+1]??r();return{min:E,max:F}},v=(k,S)=>{const E=[...d()];if(!_e(k,E))return;const F=p(k,E),j={...l(),min:F.min,max:F.max};E[k]=Ae(tt(S,F.min,F.max),j),d.set(E),i.onValuesChange?.(E)},g=c((k,S)=>{u()||(v(k,S),h.set(k))},`${e}.setValue`),f=c(k=>{if(u())return;const S=d();if(!_e(k,S))return;const E=p(k,S),F={...l(),min:E.min,max:E.max};v(k,ga(S[k]??E.min,F)),h.set(k)},`${e}.increment`),x=c(k=>{if(u())return;const S=d();if(!_e(k,S))return;const E=p(k,S),F={...l(),min:E.min,max:E.max};v(k,ya(S[k]??E.max,F)),h.set(k)},`${e}.decrement`),m=c(k=>{if(u())return;const S=d();if(!_e(k,S))return;const E=p(k,S),F={...l(),min:E.min,max:E.max};v(k,xa(S[k]??E.min,F)),h.set(k)},`${e}.incrementLarge`),I=c(k=>{if(u())return;const S=d();if(!_e(k,S))return;const E=p(k,S),F={...l(),min:E.min,max:E.max};v(k,wa(S[k]??E.max,F)),h.set(k)},`${e}.decrementLarge`),$=c(k=>{_e(k,d())&&h.set(k)},`${e}.setActiveThumb`),T=c(k=>{u.set(k)},`${e}.setDisabled`),_=c((k,S)=>{switch(S.key){case"ArrowRight":case"ArrowUp":f(k);return;case"ArrowLeft":case"ArrowDown":x(k);return;case"PageUp":m(k);return;case"PageDown":I(k);return;case"Home":{const{min:E}=p(k);g(k,E);return}case"End":{const{max:E}=p(k);g(k,E);return}default:return}},`${e}.handleKeyDown`);return{state:{values:d,min:a,max:r,step:o,largeStep:n,activeThumbIndex:h,isDisabled:u,orientation:t},actions:{setValue:g,increment:f,decrement:x,incrementLarge:m,decrementLarge:I,setActiveThumb:$,handleKeyDown:_,setDisabled:T},contracts:{getRootProps(){return{id:`${e}-root`,"data-orientation":t,"aria-disabled":u()?"true":void 0}},getTrackProps(){return{id:`${e}-track`,"data-orientation":t}},getThumbProps(k){const S=d();if(!_e(k,S))throw new Error(`Unknown slider thumb index: ${k}`);const{min:E,max:F}=p(k,S),j=S[k]??E,X=h(),oe=X==null?k===0:X===k;return{id:`${e}-thumb-${k}`,role:"slider",tabindex:u()?"-1":"0","aria-valuenow":String(j),"aria-valuemin":String(E),"aria-valuemax":String(F),"aria-valuetext":i.formatValueText?.(j,k),"aria-orientation":t,"aria-disabled":u()?"true":void 0,"aria-label":i.getThumbAriaLabel?.(k),"data-active":oe?"true":"false",onKeyDown:Z=>_(k,Z)}}}}}const vt=new Map;function ki(i,e){let t=vt.get(i);t||(t=new Set,vt.set(i,t)),t.add(e)}function Ii(i,e){const t=vt.get(i);t&&(t.delete(e),t.size===0&&vt.delete(i))}function Ro(i,e){const t=vt.get(i);if(t)for(const s of t)s!==e&&s.actions.close()}const To=i=>i===" "||i==="Spacebar";function Bo(i={}){const e=i.idBase??"disclosure",t=w(i.isOpen??!1,`${e}.isOpen`),s=w(i.isDisabled??!1,`${e}.isDisabled`),a=w(i.name??null,`${e}.name`),r=B=>{t()!==B&&(t.set(B),i.onOpenChange?.(B))};let o;const n=c(()=>{if(s())return;r(!0);const B=a();B!=null&&Ro(B,o)},`${e}.open`),l=c(()=>{s()||r(!1)},`${e}.close`),d=c(()=>{s()||(t()?l():n())},`${e}.toggle`),u=c(B=>{s.set(B)},`${e}.setDisabled`),h=c(B=>{const A=a();A!==B&&(A!=null&&Ii(A,o),a.set(B),B!=null&&ki(B,o))},`${e}.setName`),p=c(()=>{d()},`${e}.handleClick`),v=c(B=>{if(!s()){if(B.key==="Enter"||To(B.key)){B.preventDefault?.(),d();return}if(B.key==="ArrowDown"||B.key==="ArrowRight"){B.preventDefault?.(),n();return}if(B.key==="ArrowUp"||B.key==="ArrowLeft"){B.preventDefault?.(),l();return}}},`${e}.handleKeyDown`),g=c(()=>{const B=a();B!=null&&Ii(B,o)},`${e}.destroy`),f=`${e}-trigger`,x=`${e}-panel`,T={state:{isOpen:t,isDisabled:s,name:a},actions:{open:n,close:l,toggle:d,setDisabled:u,setName:h,handleClick:p,handleKeyDown:v,destroy:g},contracts:{getTriggerProps(){return{id:f,role:"button",tabindex:s()?"-1":"0","aria-expanded":t()?"true":"false","aria-controls":x,"aria-disabled":s()?"true":void 0,onClick:p,onKeyDown:v}},getPanelProps(){return{id:x,"aria-labelledby":f,hidden:!t()}}}};o=T;const _=a();return _!=null&&ki(_,T),T}const Po=i=>i===" "||i==="Spacebar";function Fo(i){const e=i.idBase??"accordion",t=w(i.allowMultiple??!1,`${e}.allowMultiple`),s=w(i.allowZeroExpanded??!0,`${e}.allowZeroExpanded`),a=w(i.headingLevel??3,`${e}.headingLevel`),r=w(i.ariaLabel,`${e}.ariaLabel`),o=w([...i.sections],`${e}.sections`),n=ae(()=>new Set(o().map(K=>K.id)),`${e}.sectionIds`),l=ae(()=>new Map(o().map(K=>[K.id,K])),`${e}.sectionById`),u=w((()=>{const K=new Set(i.sections.map(Y=>Y.id)),D=[...new Set(i.initialExpandedIds??[])].filter(Y=>K.has(Y)),C=i.allowMultiple??!1,H=i.allowZeroExpanded??!0;if(!C&&D.length>1){const Y=D[0];return Y==null?new Set:new Set([Y])}if(!H&&D.length===0){const Y=i.sections[0]?.id;return Y==null?new Set:new Set([Y])}return new Set(D)})(),`${e}.expandedIds`),h=ae(()=>{const D=u().values().next();return D.done?null:D.value},`${e}.value`),p=ae(()=>[...u()],`${e}.expandedValues`),v=Rs({idBase:`${e}.nav`,orientation:"vertical",focusStrategy:"roving-tabindex",wrapMode:"wrap",items:i.sections}),g=K=>n().has(K)&&l().get(K)?.disabled!==!0,f=(K,D)=>D.size===1&&D.has(K),x=K=>{const D=u(),C=K(D);u.set(C)},m=()=>{const K=t(),D=s(),C=n(),H=u();let Y=new Set([...H].filter(re=>C.has(re)));if(!K&&Y.size>1){const re=Y.values().next().value;Y=re!=null?new Set([re]):new Set}if(!D&&Y.size===0){const me=o().find(fe=>!fe.disabled);me&&(Y=new Set([me.id]))}u.set(Y)},I=c(K=>{g(K)&&x(D=>{if(D.has(K))return D;if(!t())return new Set([K]);const C=new Set(D);return C.add(K),C})},`${e}.expand`),$=c(K=>{g(K)&&x(D=>{if(!D.has(K)||!s()&&f(K,D))return D;const C=new Set(D);return C.delete(K),C})},`${e}.collapse`),T=c(K=>{g(K)&&(u().has(K)?$(K):I(K))},`${e}.toggle`),_=c(K=>{v.actions.setActive(K)},`${e}.setFocused`),B=c(()=>{v.actions.moveNext()},`${e}.moveNext`),A=c(()=>{v.actions.movePrev()},`${e}.movePrev`),N=c(()=>{v.actions.moveFirst()},`${e}.moveFirst`),k=c(()=>{v.actions.moveLast()},`${e}.moveLast`),S=c(K=>{switch(K.key){case"ArrowDown":B();return;case"ArrowUp":A();return;case"Home":N();return;case"End":k();return;default:if(K.key==="Enter"||Po(K.key)){const D=v.state.activeId();D!=null&&T(D)}}},`${e}.handleKeyDown`),E=c(K=>{o.set([...K]),v.actions.setItems(K),m()},`${e}.setSections`),F=c(K=>{t.set(K),m()},`${e}.setAllowMultiple`),j=c(K=>{s.set(K),m()},`${e}.setAllowZeroExpanded`),X=c(K=>{a.set(Math.max(1,Math.min(6,K)))},`${e}.setHeadingLevel`),oe=c(K=>{r.set(K)},`${e}.setAriaLabel`),Z=c(K=>{const D=n(),C=t(),H=K.filter(Y=>D.has(Y));if(!C&&H.length>1?u.set(new Set(H.slice(0,1))):u.set(new Set(H)),!s()&&u().size===0){const Y=o().find(re=>!re.disabled);Y&&u.set(new Set([Y.id]))}},`${e}.setExpandedIds`),le=K=>`${e}-trigger-${K}`,z=K=>`${e}-panel-${K}`,O={toggle:T,expand:I,collapse:$,setFocused:_,moveNext:B,movePrev:A,moveFirst:N,moveLast:k,handleKeyDown:S,setSections:E,setAllowMultiple:F,setAllowZeroExpanded:j,setHeadingLevel:X,setAriaLabel:oe,setExpandedIds:Z},M={getRootProps(){return{id:`${e}-root`,"aria-label":r()}},getHeaderProps(K){if(!n().has(K))throw new Error(`Unknown accordion header id: ${K}`);return{id:`${e}-header-${K}`}},getTriggerProps(K){const D=l().get(K);if(!D)throw new Error(`Unknown accordion trigger id: ${K}`);const C=u(),H=C.has(K),Y=!s()&&f(K,C),re=D.disabled===!0||Y;return{id:le(K),role:"button",tabindex:v.state.activeId()===K&&D.disabled!==!0?"0":"-1","aria-expanded":H?"true":"false","aria-controls":z(K),"aria-disabled":re?"true":"false",onClick:()=>T(K),onFocus:()=>_(K),onKeyDown:S}},getPanelProps(K){if(!n().has(K))throw new Error(`Unknown accordion panel id: ${K}`);return{id:z(K),role:"region","aria-labelledby":le(K),hidden:!u().has(K)}}};return{state:{expandedIds:u,focusedId:v.state.activeId,value:h,expandedValues:p,sections:o,allowMultiple:t,allowZeroExpanded:s,headingLevel:a,ariaLabel:r},actions:O,contracts:M}}const No=i=>i===" "||i==="Spacebar";function jt(i={}){const e=i.idBase??"dialog",t=i.closeOnEscape??!0,s=i.closeOnOutsidePointer??!0,a=i.closeOnOutsideFocus??!0,r=w(i.type??"dialog",`${e}.type`),o=w(i.isModal??!0,`${e}.isModal`),n=w(i.initialFocusId??null,`${e}.initialFocusId`),l=`${e}-trigger`,d=`${e}-content`,u=i.ariaLabelledBy??`${e}-title`,h=i.ariaDescribedBy??`${e}-description`,p=$a({idBase:`${e}.overlay`,initialOpen:i.initialOpen,initialTriggerId:l,trapFocus:o(),restoreFocus:!0}),v=ae(()=>p.state.isOpen()&&o(),`${e}.shouldLockScroll`),g=c((S="programmatic")=>{p.actions.open(S,p.state.triggerId()??l)},`${e}.open`),f=c((S="programmatic")=>{p.actions.close(S)},`${e}.close`),x=c((S="programmatic")=>{if(p.state.isOpen()){f("programmatic");return}g(S)},`${e}.toggle`),m=c(S=>{p.actions.setTrigger(S)},`${e}.setTriggerId`),I=c(()=>{x("pointer")},`${e}.handleTriggerClick`),$=c(S=>{(S.key==="Enter"||No(S.key))&&x("keyboard")},`${e}.handleTriggerKeyDown`),T=c(S=>{!t&&S.key==="Escape"||p.actions.handleKeyDown(S)},`${e}.handleContentKeyDown`),_=c(()=>{s&&p.actions.handleOutsidePointer()},`${e}.handleOutsidePointer`),B=c(()=>{a&&p.actions.handleOutsideFocus()},`${e}.handleOutsideFocus`),A={setTriggerId:m,open:g,close:f,toggle:x,handleTriggerClick:I,handleTriggerKeyDown:$,handleKeyDown:T,handleOutsidePointer:_,handleOutsideFocus:B},N={getTriggerProps(){return{id:p.state.triggerId()??l,role:"button",tabindex:"0","aria-haspopup":"dialog","aria-expanded":p.state.isOpen()?"true":"false","aria-controls":d,onClick:I,onKeyDown:$}},getOverlayProps(){return{id:`${e}-overlay`,hidden:!p.state.isOpen(),"data-open":p.state.isOpen()?"true":"false",onPointerDownOutside:_,onFocusOutside:B}},getContentProps(){return{id:d,role:r(),tabindex:"-1","aria-modal":o()?"true":"false","aria-labelledby":u,"aria-describedby":h,"data-initial-focus":n()??void 0,onKeyDown:T}},getTitleProps(){return{id:u}},getDescriptionProps(){return{id:h}},getCloseButtonProps(){return{id:`${e}-close`,role:"button",tabindex:"0",onClick:()=>f("programmatic")}},getHeaderCloseButtonProps(){return{id:`${e}-header-close`,role:"button",tabindex:"0","aria-label":"Close",onClick:()=>f("programmatic")}}};return{state:{isOpen:p.state.isOpen,isModal:o,type:r,restoreTargetId:p.state.restoreTargetId,isFocusTrapped:p.state.isFocusTrapped,shouldLockScroll:v,initialFocusTargetId:n},actions:A,contracts:N}}function Vo(i={}){const e=i.idBase??"alert-dialog",t=`${e}-cancel`,s=jt({idBase:e,initialOpen:i.initialOpen,isModal:!0,closeOnEscape:i.closeOnEscape,closeOnOutsidePointer:i.closeOnOutsidePointer,closeOnOutsideFocus:i.closeOnOutsideFocus,initialFocusId:i.initialFocusId??t,ariaLabelledBy:i.ariaLabelledBy,ariaDescribedBy:i.ariaDescribedBy});i.triggerId!=null&&s.actions.setTriggerId(i.triggerId);const a=c(()=>{s.actions.open("programmatic")},`${e}.open`),r=c(()=>{s.actions.close("programmatic")},`${e}.close`),o=c(p=>{s.actions.handleKeyDown(p)},`${e}.handleKeyDown`),n=c(()=>{i.onCancel?.(),r()},`${e}.cancel`),l=c(()=>{i.onAction?.(),i.closeOnAction!==!1&&r()},`${e}.action`),d={open:a,close:r,handleKeyDown:o},u={getDialogProps(){const p=s.contracts.getContentProps(),v=p["aria-labelledby"]??`${e}-title`,g=p["aria-describedby"]??`${e}-description`;return{...p,role:"alertdialog","aria-modal":"true","aria-labelledby":v,"aria-describedby":g}},getOverlayProps(){return s.contracts.getOverlayProps()},getTitleProps(){return s.contracts.getTitleProps()},getDescriptionProps(){return s.contracts.getDescriptionProps()},getCancelButtonProps(){return{id:t,role:"button",tabindex:"0",onClick:n}},getActionButtonProps(){return{id:`${e}-action`,role:"button",tabindex:"0",onClick:l}}};return{state:{isOpen:s.state.isOpen,restoreTargetId:s.state.restoreTargetId,isFocusTrapped:s.state.isFocusTrapped,initialFocusTargetId:s.state.initialFocusTargetId},actions:d,contracts:u}}function zo(i){return new Set(i.trim().split(/\s+/).filter(Boolean))}function Ko(i={}){const e=i.idBase??"tooltip",t=Math.max(i.showDelay??0,0),s=Math.max(i.hideDelay??0,0),a=zo(i.trigger??"hover focus"),r=a.has("hover"),o=a.has("focus"),n=a.has("click"),d=a.has("manual")&&!r&&!o&&!n,u=w(i.initialOpen??!1,`${e}.isOpen`),h=w(i.isDisabled??!1,`${e}.isDisabled`);let p=null,v=null;const g=()=>{p!=null&&(clearTimeout(p),p=null)},f=()=>{v!=null&&(clearTimeout(v),v=null)},x=()=>{g(),f()},m=c(()=>{h()||(x(),u.set(!0))},`${e}.open`),I=c(()=>{x(),u.set(!1)},`${e}.close`),$=c(O=>{h.set(O),O&&I()},`${e}.setDisabled`),T=()=>{if(!h()){if(f(),t===0){m();return}g(),p=setTimeout(()=>{p=null,m()},t)}},_=()=>{if(g(),s===0){I();return}f(),v=setTimeout(()=>{v=null,I()},s)},B=c(()=>{T()},`${e}.show`),A=c(()=>{_()},`${e}.hide`),N=c(()=>{!r||d||T()},`${e}.handlePointerEnter`),k=c(()=>{!r||d||_()},`${e}.handlePointerLeave`),S=c(()=>{!o||d||T()},`${e}.handleFocus`),E=c(()=>{!o||d||_()},`${e}.handleBlur`),F=c(()=>{!n||d||h()||(x(),u.set(!u()))},`${e}.handleClick`),j=c(O=>{O.key==="Escape"&&I()},`${e}.handleKeyDown`),X=`${e}-trigger`,oe=`${e}-content`;return{state:{isOpen:u,isDisabled:h},actions:{open:m,close:I,show:B,hide:A,setDisabled:$,handleKeyDown:j,handlePointerEnter:N,handlePointerLeave:k,handleFocus:S,handleBlur:E,handleClick:F},contracts:{getTriggerProps(){const O={id:X,"aria-describedby":h()?void 0:oe,onKeyDown:j};return r&&!d&&(O.onPointerEnter=N,O.onPointerLeave=k),o&&!d&&(O.onFocus=S,O.onBlur=E),n&&!d&&(O.onClick=F),O},getTooltipProps(){return{id:oe,role:"tooltip",tabindex:"-1",hidden:!u()}}}}}const _o=i=>({key:i.key,shiftKey:i.shiftKey??!1,ctrlKey:i.ctrlKey??!1,metaKey:i.metaKey??!1,altKey:i.altKey??!1});function Uo(i){const e=i.idBase??"menu-button",t=Ts({idBase:e,items:i.items,ariaLabel:i.ariaLabel,initialOpen:i.initialOpen,initialActiveId:i.initialActiveId,closeOnSelect:i.closeOnSelect}),s=w(null,`${e}.restoreTargetId`),a=g=>{if(t.actions.close(),g==="escape"||g==="select"){s.set(`${e}-trigger`);return}s.set(null)},r=c(()=>{t.actions.open("programmatic"),s.set(null)},`${e}.open`),o=c(()=>{a("programmatic")},`${e}.close`),n=c(()=>{if(t.state.isOpen()){a("programmatic");return}t.actions.toggle("pointer"),s.set(null)},`${e}.toggle`),l=c(g=>{const f=t.state.isOpen();t.actions.select(g),f&&!t.state.isOpen()&&s.set(`${e}-trigger`)},`${e}.select`),d=c(()=>{t.state.isOpen()&&a("outside-pointer")},`${e}.handleOutsidePointer`),u=c(g=>{if(!t.state.isOpen()){if(g.key==="Enter"||g.key===" "){t.actions.open("keyboard"),t.actions.moveFirst(),s.set(null);return}t.actions.handleTriggerKeyDown({key:g.key});return}if(g.key==="Escape"){a("escape");return}if(g.key==="Tab"){a("tab");return}t.actions.handleMenuKeyDown(_o(g))},`${e}.handleKeyDown`),h={open:r,close:o,toggle:n,select:l,handleOutsidePointer:d,handleKeyDown:u},p={getTriggerProps(){return{...t.contracts.getTriggerProps(),role:"button",onClick:n,onKeyDown:u}},getMenuProps(){return{...t.contracts.getMenuProps(),hidden:!t.state.isOpen(),onKeyDown:u}},getItemProps(g){return{...t.contracts.getItemProps(g),onClick:()=>l(g)}}};return{state:{isOpen:t.state.isOpen,activeId:t.state.activeId,restoreTargetId:s},actions:h,contracts:p}}function Si(i){const e=i.idBase??"toolbar",t=i.orientation??"horizontal",s=i.items,a=s.filter($=>!$.separator),r=()=>{const $=a.filter(T=>!T.disabled);return i.initialActiveId!=null&&$.some(T=>T.id===i.initialActiveId)?i.initialActiveId:$[0]?.id??null},o=Rs({idBase:`${e}.nav`,items:a,orientation:t,focusStrategy:"roving-tabindex",wrapMode:i.wrap===!1?"clamp":"wrap",initialActiveId:r()}),n=w(null,`${e}.lastActiveId`),l=c($=>{const T=s.find(_=>_.id===$);!T||T.separator||o.actions.setActive($)},`${e}.setActive`),d=c(()=>{o.actions.moveNext()},`${e}.moveNext`),u=c(()=>{o.actions.movePrev()},`${e}.movePrev`),h=c(()=>{o.actions.moveFirst()},`${e}.moveFirst`),p=c(()=>{o.actions.moveLast()},`${e}.moveLast`),v=c($=>{switch($.key){case"Home":h();return;case"End":p();return;case"ArrowRight":t==="horizontal"&&d();return;case"ArrowLeft":t==="horizontal"&&u();return;case"ArrowDown":t==="vertical"&&d();return;case"ArrowUp":t==="vertical"&&u();return;default:return}},`${e}.handleKeyDown`),g=c(()=>{n.set(o.state.activeId())},`${e}.handleToolbarBlur`),f=c(()=>{const $=n();if($==null)return;const T=a.find(_=>_.id===$);!T||T.disabled||o.actions.setActive($)},`${e}.handleToolbarFocus`),x={setActive:l,moveNext:d,movePrev:u,moveFirst:h,moveLast:p,handleKeyDown:v,handleToolbarFocus:f,handleToolbarBlur:g},m={getRootProps(){return{id:`${e}-root`,role:"toolbar","aria-orientation":t,"aria-label":i.ariaLabel}},getItemProps($){return{...o.contracts.getItemFocusProps($),onFocus:()=>l($)}},getSeparatorProps($){const T=s.find(B=>B.id===$);if(!T)throw new Error(`Unknown toolbar item id: ${$}`);if(!T.separator)throw new Error(`Item "${$}" is not a separator`);const _=t==="horizontal"?"vertical":"horizontal";return{id:`${e}-separator-${$}`,role:"separator","aria-orientation":_}}};return{state:{activeId:o.state.activeId,lastActiveId:n,orientation:t},actions:x,contracts:m}}const vs=(i,e)=>`${i}::${e}`,Ue=i=>vs(i.rowId,i.colId),qo=(i,e,t)=>Math.min(Math.max(i,e),t);function Ci(i){const e=i.idBase??"grid",t=i.focusStrategy??"roving-tabindex",s=i.selectionMode??"single",a=i.selectionFollowsFocus??!1,r=Math.max(i.pageSize??10,1),o=[...i.rows],n=[...i.columns],l=new Map(o.map((P,b)=>[P.id,{row:P,index:b}])),d=new Map(n.map((P,b)=>[P.id,{column:P,index:b}])),u=new Set((i.disabledCells??[]).map(P=>Ue(P))),h=ae(()=>Math.max(i.totalRowCount??o.length,o.length),`${e}.rowCount`),p=ae(()=>Math.max(i.totalColumnCount??n.length,n.length),`${e}.columnCount`),v=P=>l.get(P)?.index??-1,g=P=>d.get(P)?.index??-1,f=P=>{const b=l.get(P);return b?b.row.index??b.index+1:1},x=P=>{const b=d.get(P);return b?b.column.index??b.index+1:1},m=(P,b)=>{const R=l.get(P),J=d.get(b);return!!(!R||!J||R.row.disabled||J.column.disabled||u.has(vs(P,b)))},I=(P,b)=>l.has(P)&&d.has(b),$=P=>{const b=o[P]?.id;if(!b)return null;for(const R of n)if(!m(b,R.id))return{rowId:b,colId:R.id};return null},T=P=>{const b=o[P]?.id;if(!b)return null;for(let R=n.length-1;R>=0;R-=1){const J=n[R]?.id;if(J!=null&&!m(b,J))return{rowId:b,colId:J}}return null},_=()=>{for(let P=0;P<o.length;P+=1){const b=$(P);if(b)return b}return null},B=()=>{for(let P=o.length-1;P>=0;P-=1){const b=T(P);if(b)return b}return null},A=P=>P==null||!I(P.rowId,P.colId)||m(P.rowId,P.colId)?_():P,N=w(A(i.initialActiveCellId??null),`${e}.activeCellId`),k=w(new Set((i.initialSelectedCellIds??[]).filter(P=>I(P.rowId,P.colId)&&!m(P.rowId,P.colId)).map(P=>Ue(P))),`${e}.selectedCellIds`),S=P=>{k.set(new Set(P))},E=c(P=>{const b=A(P);if(!b){N.set(null);return}N.set(b),a&&S([Ue(b)])},`${e}.setActiveCell`),F=P=>{const b=A(N());if(!b)return;const R=v(b.rowId),J=g(b.colId);if(!(R<0||J<0))for(let ee=J+P;ee>=0&&ee<n.length;ee+=P){const pe=n[ee]?.id;if(pe!=null&&!m(b.rowId,pe)){E({rowId:b.rowId,colId:pe});return}}},j=P=>{const b=A(N());if(!b)return;const R=v(b.rowId);if(!(R<0))for(let J=R+P;J>=0&&J<o.length;J+=P){const ee=o[J]?.id;if(ee!=null&&!m(ee,b.colId)){E({rowId:ee,colId:b.colId});return}}},X=c(()=>{j(-1)},`${e}.moveUp`),oe=c(()=>{j(1)},`${e}.moveDown`),Z=c(()=>{F(-1)},`${e}.moveLeft`),le=c(()=>{F(1)},`${e}.moveRight`),z=c(()=>{const P=A(N());if(!P)return;const b=v(P.rowId);if(b<0)return;const R=$(b);R&&E(R)},`${e}.moveRowStart`),O=c(()=>{const P=A(N());if(!P)return;const b=v(P.rowId);if(b<0)return;const R=T(b);R&&E(R)},`${e}.moveRowEnd`),M=c(()=>{const P=_();P&&E(P)},`${e}.moveGridStart`),G=c(()=>{const P=B();P&&E(P)},`${e}.moveGridEnd`),K=P=>{const b=A(N());if(!b)return;const R=v(b.rowId);if(R<0)return;const J=qo(R+P*r,0,o.length-1);for(let ee=J;ee>=0&&ee<o.length;ee+=P){const pe=o[ee]?.id;if(pe!=null&&!m(pe,b.colId)){E({rowId:pe,colId:b.colId});return}}},D=c(()=>{K(-1)},`${e}.pageUp`),C=c(()=>{K(1)},`${e}.pageDown`),H=c(P=>{if(!I(P.rowId,P.colId)||m(P.rowId,P.colId))return;const b=Ue(P);if(s==="multiple"){S([b]);return}S([b])},`${e}.selectCell`),Y=c(P=>{if(!I(P.rowId,P.colId)||m(P.rowId,P.colId))return;if(s!=="multiple"){H(P);return}const b=Ue(P),R=new Set(k());R.has(b)?R.delete(b):R.add(b),k.set(R)},`${e}.toggleCellSelection`),re=c(P=>{if(v(P)<0)return;const R=n.map(ee=>({rowId:P,colId:ee.id})).filter(ee=>!m(ee.rowId,ee.colId)).map(ee=>Ue(ee));if(R.length===0)return;if(s==="multiple"){S(R);return}const J=R[0];J!=null&&S([J])},`${e}.selectRow`),me=c(P=>{if(g(P)<0)return;const R=o.map(ee=>({rowId:ee.id,colId:P})).filter(ee=>!m(ee.rowId,ee.colId)).map(ee=>Ue(ee));if(R.length===0)return;if(s==="multiple"){S(R);return}const J=R[0];J!=null&&S([J])},`${e}.selectColumn`),fe=c(P=>{const b=P.ctrlKey===!0||P.metaKey===!0;switch(P.key){case"ArrowUp":X();return;case"ArrowDown":oe();return;case"ArrowLeft":Z();return;case"ArrowRight":le();return;case"Home":b?M():z();return;case"End":b?G():O();return;case"PageUp":D();return;case"PageDown":C();return;case"Enter":oe();return;case" ":{const R=N();R&&(s==="multiple"?Y(R):H(R))}return;default:return}},`${e}.handleKeyDown`),xe={setActiveCell:E,moveUp:X,moveDown:oe,moveLeft:Z,moveRight:le,moveRowStart:z,moveRowEnd:O,moveGridStart:M,moveGridEnd:G,pageUp:D,pageDown:C,selectCell:H,toggleCellSelection:Y,selectRow:re,selectColumn:me,handleKeyDown:fe},Ie=(P,b)=>`${e}-cell-${P}-${b}`;return{state:{activeCellId:N,selectedCellIds:k,rowCount:h,columnCount:p},actions:xe,contracts:{getGridProps(){const P=N();return{id:`${e}-root`,role:"grid",tabindex:t==="aria-activedescendant"?"0":"-1","aria-label":i.ariaLabel,"aria-labelledby":i.ariaLabelledBy,"aria-multiselectable":s==="multiple"?"true":"false","aria-colcount":p(),"aria-rowcount":h(),"aria-activedescendant":t==="aria-activedescendant"&&P!=null?Ie(P.rowId,P.colId):void 0}},getRowProps(P){if(!l.has(P))throw new Error(`Unknown grid row id: ${P}`);return{id:`${e}-row-${P}`,role:"row","aria-rowindex":f(P)}},getCellProps(P,b){if(!I(P,b))throw new Error(`Unknown grid cell id: ${P}:${b}`);const R=vs(P,b),J=N(),ee=J?.rowId===P&&J?.colId===b,pe=m(P,b);return{id:Ie(P,b),role:"gridcell",tabindex:t==="roving-tabindex"&&ee&&!pe?"0":"-1","aria-colindex":x(b),"aria-selected":k().has(R)?"true":"false","aria-readonly":i.isReadOnly?"true":void 0,"aria-disabled":pe?"true":void 0,"data-active":ee?"true":"false",onFocus:()=>E({rowId:P,colId:b})}}}}}const Ei=(i,e)=>`${i}::${e}`,Ho=(i,e)=>{const t=[],s=[...i.get(e)?.childIds??[]];for(;s.length>0;){const a=s.shift();a&&(t.push(a),s.push(...i.get(a)?.childIds??[]))}return t},jo=i=>{const e=new Map,t=new Map,s=[],a=[],r=(o,n,l)=>{const d=o.length;o.forEach((u,h)=>{const p=(u.children??[]).map(g=>g.id),v=a.length+1;a.push(u.id),e.set(u.id,u),t.set(u.id,{id:u.id,parentId:n,childIds:p,level:l,posInSet:h+1,setSize:d,rowIndex:v,disabled:u.disabled===!0}),n==null&&s.push(u.id),p.length>0&&r(u.children??[],u.id,l+1)})};return r(i,null,1),{rowById:e,metaById:t,rootIds:s}};function Ai(i){const e=i.idBase??"treegrid",t=i.selectionMode??"single",s=[...i.columns],{rowById:a,metaById:r,rootIds:o}=jo(i.rows),n=[...r.keys()],l=new Set(n),d=new Set(n.filter(b=>r.get(b)?.disabled!==!0)),u=new Map(s.map((b,R)=>[b.id,{column:b,index:R}])),h=new Set((i.disabledCells??[]).map(b=>Ei(b.rowId,b.colId))),p=b=>(r.get(b)?.childIds.length??0)>0,v=b=>I().has(b),g=(b,R)=>a.has(b)&&u.has(R),f=b=>u.get(b)?.index??-1,x=b=>{const R=u.get(b);return R?R.column.index??R.index+1:1},m=(b,R)=>{const J=r.get(b),ee=u.get(R);return!!(!J||!ee||J.disabled||ee.column.disabled||h.has(Ei(b,R)))},I=w(new Set((i.initialExpandedRowIds??[]).filter(b=>l.has(b)&&p(b))),`${e}.expandedRowIds`),$=w(new Set((i.initialSelectedRowIds??[]).filter(b=>d.has(b)).slice(0,t==="single"?1:void 0)),`${e}.selectedRowIds`),T=()=>{const b=I(),R=[],J=ee=>{if(!r.has(ee)||(R.push(ee),!b.has(ee)))return;const pe=r.get(ee)?.childIds??[];for(const V of pe)J(V)};for(const ee of o)J(ee);return R},_=()=>T().filter(b=>d.has(b)),B=b=>{for(const R of s)if(!m(b,R.id))return{rowId:b,colId:R.id};return null},A=b=>{for(let R=s.length-1;R>=0;R-=1){const J=s[R]?.id;if(J!=null&&!m(b,J))return{rowId:b,colId:J}}return null},N=()=>{for(const b of _()){const R=B(b);if(R)return R}return null},k=()=>{const b=_();for(let R=b.length-1;R>=0;R-=1){const J=b[R];if(!J)continue;const ee=A(J);if(ee)return ee}return null},S=b=>b==null||!g(b.rowId,b.colId)||!T().includes(b.rowId)||m(b.rowId,b.colId)?N():b,E=w(S(i.initialActiveCellId??null),`${e}.activeCellId`),F=c(b=>{const R=S(b);if(!R){E.set(null);return}E.set(R)},`${e}.setActiveCell`),j=b=>{const R=S(E());if(!R)return;const J=_(),ee=J.indexOf(R.rowId);if(!(ee<0))for(let pe=ee+b;pe>=0&&pe<J.length;pe+=b){const V=J[pe];if(V&&!m(V,R.colId)){F({rowId:V,colId:R.colId});return}}},X=b=>{const R=S(E());if(!R)return;const J=f(R.colId);if(!(J<0))for(let ee=J+b;ee>=0&&ee<s.length;ee+=b){const pe=s[ee]?.id;if(pe!=null&&!m(R.rowId,pe)){F({rowId:R.rowId,colId:pe});return}}},oe=c(()=>{j(-1)},`${e}.moveUp`),Z=c(()=>{j(1)},`${e}.moveDown`),le=c(()=>{const b=S(E());if(!b)return;const R=B(b.rowId);R&&F(R)},`${e}.moveRowStart`),z=c(()=>{const b=S(E());if(!b)return;const R=A(b.rowId);R&&F(R)},`${e}.moveRowEnd`),O=c(()=>{const b=N();b&&F(b)},`${e}.moveGridStart`),M=c(()=>{const b=k();b&&F(b)},`${e}.moveGridEnd`),G=c(b=>{if(!p(b)||I().has(b))return;const R=new Set(I());R.add(b),I.set(R)},`${e}.expandRow`),K=c(b=>{if(!p(b)||!I().has(b))return;const R=new Set(I());R.delete(b),I.set(R);const J=E();if(!J||J.rowId===b)return;if(Ho(r,b).includes(J.rowId))if(!m(b,J.colId))F({rowId:b,colId:J.colId});else{const pe=B(b);pe&&F(pe)}},`${e}.collapseRow`),D=c(b=>{I().has(b)?K(b):G(b)},`${e}.toggleRowExpanded`),C=c(b=>{if(d.has(b)){if(t==="single"){$.set(new Set([b]));return}$.set(new Set([b]))}},`${e}.selectRow`),H=c(b=>{if(!d.has(b))return;if(t==="single"){$.set(new Set([b]));return}const R=new Set($());R.has(b)?R.delete(b):R.add(b),$.set(R)},`${e}.toggleRowSelection`),Y=c(()=>{const b=S(E());if(!b)return;const R=r.get(b.rowId);if(R){if(p(b.rowId)&&v(b.rowId)){K(b.rowId);return}if(R.parentId!=null){const J=R.parentId;if(!m(J,b.colId))F({rowId:J,colId:b.colId});else{const ee=B(J);ee&&F(ee)}return}X(-1)}},`${e}.moveLeft`),re=c(()=>{const b=S(E());if(b){if(p(b.rowId)&&!v(b.rowId)){G(b.rowId);return}if(p(b.rowId)&&v(b.rowId)){const R=r.get(b.rowId)?.childIds[0];if(R!=null&&!m(R,b.colId)){F({rowId:R,colId:b.colId});return}if(R!=null){const J=B(R);if(J){F(J);return}}}X(1)}},`${e}.moveRight`),me=c(b=>{const R=b.ctrlKey===!0||b.metaKey===!0;switch(b.key){case"ArrowUp":oe();return;case"ArrowDown":Z();return;case"ArrowLeft":Y();return;case"ArrowRight":re();return;case"Home":R?O():le();return;case"End":R?M():z();return;default:return}},`${e}.handleKeyDown`),fe=ae(()=>n.length,`${e}.rowCount`),xe=ae(()=>s.length,`${e}.columnCount`),Ie={moveUp:oe,moveDown:Z,moveLeft:Y,moveRight:re,moveRowStart:le,moveRowEnd:z,expandRow:G,collapseRow:K,toggleRowExpanded:D,selectRow:C,toggleRowSelection:H,handleKeyDown:me},W=(b,R)=>`${e}-cell-${b}-${R}`;return{state:{activeCellId:E,expandedRowIds:I,selectedRowIds:$,rowCount:fe,columnCount:xe},actions:Ie,contracts:{getTreegridProps(){return{id:`${e}-root`,role:"treegrid",tabindex:"-1","aria-label":i.ariaLabel,"aria-labelledby":i.ariaLabelledBy,"aria-multiselectable":t==="multiple"?"true":"false","aria-rowcount":fe(),"aria-colcount":xe()}},getRowProps(b){const R=r.get(b);if(!R)throw new Error(`Unknown treegrid row id: ${b}`);const ee=R.childIds.length>0?I().has(b):void 0;return{id:`${e}-row-${b}`,role:"row","aria-level":R.level,"aria-posinset":R.posInSet,"aria-setsize":R.setSize,"aria-rowindex":a.get(b)?.index??R.rowIndex,"aria-expanded":ee==null?void 0:ee?"true":"false","aria-selected":$().has(b)?"true":"false","aria-disabled":R.disabled?"true":void 0}},getCellProps(b,R){if(!g(b,R))throw new Error(`Unknown treegrid cell id: ${b}:${R}`);const J=E(),ee=J?.rowId===b&&J.colId===R,pe=m(b,R),V=u.get(R)?.column.cellRole??"gridcell";return{id:W(b,R),role:V,tabindex:ee&&!pe?"0":"-1","aria-colindex":x(R),"aria-selected":$().has(b)?"true":"false","aria-disabled":pe?"true":void 0,"data-active":ee?"true":"false",onFocus:()=>F({rowId:b,colId:R})}}}}}const Ye=i=>{const e=new Set,t=[];for(const s of i)e.has(s.id)||(e.add(s.id),t.push(s));return t};function ss(i){const e=i.idBase??"feed",t=w(Ye(i.articles),`${e}.articles`),s=ae(()=>t().map(O=>O.id),`${e}.articleIds`),a=ae(()=>new Map(t().map((O,M)=>[O.id,{article:O,index:M}])),`${e}.articleById`),r=ae(()=>t().filter(O=>!O.disabled).map(O=>O.id),`${e}.enabledIds`),o=w(!1,`${e}.isLoading`),n=w(!1,`${e}.isBusy`),l=w(i.totalCount??-1,`${e}.totalCount`),d=w(null,`${e}.error`),u=ae(()=>s().length===0,`${e}.isEmpty`),h=ae(()=>d()!==null,`${e}.hasError`),p=ae(()=>i.onLoadMore!=null&&!o(),`${e}.canLoadMore`),v=ae(()=>i.onLoadNewer!=null&&!o(),`${e}.canLoadNewer`),f=w((()=>{const O=i.initialActiveArticleId;if(O!=null){const M=a().get(O);if(M&&!M.article.disabled)return O}return r()[0]??null})(),`${e}.activeArticleId`),x=()=>{const O=f(),M=r();if(M.length===0){f.set(null);return}O!=null&&M.includes(O)||f.set(M[0]??null)},m=O=>{const M=r();if(M.length===0){f.set(null);return}const G=f();if(G==null){f.set(M[0]??null);return}const K=M.indexOf(G);if(K<0){f.set(M[0]??null);return}const D=Math.min(Math.max(K+O,0),M.length-1);f.set(M[D]??null)},I=c(()=>{m(1)},`${e}.focusNextArticle`),$=c(()=>{m(-1)},`${e}.focusPrevArticle`),T=c(O=>{t.set(Ye(O)),x()},`${e}.setArticles`),_=c(O=>{t.set(Ye([...t(),...O]))},`${e}.appendArticles`),B=c(O=>{t.set(Ye([...O,...t()]))},`${e}.prependArticles`),A=c(O=>{const M=t(),G=M.findIndex(C=>C.id===O);if(G<0)return;const K=f()===O,D=M.filter(C=>C.id!==O);if(t.set(D),K){const C=r();if(C.length===0){f.set(null);return}const H=s();let Y=null;for(let re=G;re<H.length;re++)if(C.includes(H[re])){Y=H[re];break}if(Y==null){for(let re=Math.min(G-1,H.length-1);re>=0;re--)if(C.includes(H[re])){Y=H[re];break}}f.set(Y??C[0]??null)}},`${e}.removeArticle`),N=c(O=>{n.set(O)},`${e}.setBusy`),k=c(O=>{d.set(O)},`${e}.setError`),S=c(()=>{d.set(null)},`${e}.clearError`),E=c(O=>{l.set(O)},`${e}.setTotalCount`),F=c(async()=>{if(i.onLoadMore&&!o()){o.set(!0),n.set(!0);try{const O=await i.onLoadMore();t.set(Ye([...t(),...O])),x()}catch(O){d.set(O instanceof Error?O.message:String(O))}finally{o.set(!1),n.set(!1)}}},`${e}.loadMore`),j=c(async()=>{if(i.onLoadNewer&&!o()){o.set(!0),n.set(!0);try{const O=await i.onLoadNewer();t.set(Ye([...O,...t()])),x()}catch(O){d.set(O instanceof Error?O.message:String(O))}finally{o.set(!1),n.set(!1)}}},`${e}.loadNewer`),X=c(O=>{const M=O.ctrlKey===!0||O.metaKey===!0;return O.key==="PageDown"?(I(),"next"):O.key==="PageUp"?($(),"prev"):O.key==="End"&&M?"exit-after":O.key==="Home"&&M?"exit-before":null},`${e}.handleKeyDown`),oe=c(O=>{const M=a().get(O);!M||M.article.disabled||f.set(O)},`${e}.setActiveArticle`);return{state:{articleIds:s,activeArticleId:f,isLoading:o,isBusy:n,totalCount:l,isEmpty:u,hasError:h,error:d,canLoadMore:p,canLoadNewer:v},actions:{focusNextArticle:I,focusPrevArticle:$,loadMore:F,loadNewer:j,setArticles:T,appendArticles:_,prependArticles:B,removeArticle:A,setBusy:N,setError:k,clearError:S,setTotalCount:E,handleKeyDown:X},contracts:{getFeedProps(){const O={id:`${e}-root`,role:"feed","aria-busy":n()?"true":"false"};return i.ariaLabel!=null&&(O["aria-label"]=i.ariaLabel),i.ariaLabelledBy!=null&&(O["aria-labelledby"]=i.ariaLabelledBy),O},getArticleProps(O){const M=a().get(O);if(!M)throw new Error(`Unknown feed article id: ${O}`);const G=l(),K=G>=0?G:-1,D=M.index+1,C=f()===O;return{id:`${e}-article-${O}`,role:"article",tabindex:C&&!M.article.disabled?"0":"-1","aria-posinset":D,"aria-setsize":K,"aria-disabled":M.article.disabled?"true":void 0,"data-active":C?"true":"false",onFocus:()=>oe(O)}}}}}const Di=(i,e)=>e<=0?0:Math.min(Math.max(i,0),e-1);function Li(i){const e=i.idBase??"carousel",t=i.autoplay??!1,s=Math.max(i.autoplayIntervalMs??5e3,1),a=Math.max(i.visibleSlides??1,1),r=[...i.slides],o=ae(()=>r.length,`${e}.slideCount`),n=Di(i.initialActiveSlideIndex??0,r.length),l=w(n,`${e}.activeSlideIndex`),d=w(!1,`${e}.isPointerInside`),u=w(!1,`${e}.isFocusWithin`),h=w(i.initialPaused??!1,`${e}.userPaused`),p=w(t?"off":"polite",`${e}.liveMode`),v=ae(()=>t&&(h()||d()||u()),`${e}.isPaused`),g=ae(()=>{const G=o();if(G===0)return[];const K=Di(l(),G),D=Math.min(a,G);return Array.from({length:D},(C,H)=>(K+H)%G)},`${e}.visibleSlideIndices`);let f=null;const x=()=>{f!=null&&(clearTimeout(f),f=null)},m=()=>t&&!v()&&o()>1,I=(G,K)=>{const D=o();if(D<=0){l.set(0);return}const C=(G%D+D)%D;if(l.set(C),!t){p.set("polite");return}K==="manual"&&p.set("polite"),K==="auto"&&p.set("off")},$=()=>{x(),m()&&(f=setTimeout(()=>{f=null,I(l()+1,"auto"),$()},s))},T=c(()=>{I(l()+1,"manual"),$()},`${e}.moveNext`),_=c(()=>{I(l()-1,"manual"),$()},`${e}.movePrev`),B=c(G=>{I(G,"manual"),$()},`${e}.moveTo`),A=c(()=>{h.set(!1),$()},`${e}.play`),N=c(()=>{h.set(!0),x()},`${e}.pause`),k=c(()=>{h()?A():N()},`${e}.togglePlay`),S=c(()=>{u.set(!0),x()},`${e}.handleFocusIn`),E=c(()=>{u.set(!1),$()},`${e}.handleFocusOut`),F=c(()=>{d.set(!0),x()},`${e}.handlePointerEnter`),j=c(()=>{d.set(!1),$()},`${e}.handlePointerLeave`),X=c(G=>{switch(G.key){case"ArrowRight":T();return;case"ArrowLeft":_();return;case"Home":B(0);return;case"End":B(o()-1);return;default:return}},`${e}.handleKeyDown`),oe=`${e}-root`,Z=`${e}-slides`,le=G=>`${e}-slide-${G}`,z={moveNext:T,movePrev:_,moveTo:B,play:A,pause:N,togglePlay:k,handleKeyDown:X,handleFocusIn:S,handleFocusOut:E,handlePointerEnter:F,handlePointerLeave:j},O={getRootProps(){return{id:oe,role:"region","aria-roledescription":"carousel","aria-label":i.ariaLabel,"aria-labelledby":i.ariaLabelledBy,"aria-live":p(),onFocusIn:S,onFocusOut:E,onPointerEnter:F,onPointerLeave:j}},getSlideGroupProps(){return{id:Z,role:"group","aria-label":"Slides"}},getSlideProps(G){const K=o();if(G<0||G>=K)throw new Error(`Unknown carousel slide index: ${G}`);const D=g().includes(G);return{id:le(G),role:"group","aria-roledescription":"slide","aria-label":r[G]?.label??`${G+1} of ${K}`,"aria-hidden":D?"false":"true","data-active":G===l()?"true":"false"}},getNextButtonProps(){return{id:`${e}-next`,role:"button",tabindex:"0","aria-controls":Z,"aria-label":"Next slide",onClick:T}},getPrevButtonProps(){return{id:`${e}-prev`,role:"button",tabindex:"0","aria-controls":Z,"aria-label":"Previous slide",onClick:_}},getPlayPauseButtonProps(){const G=h();return{id:`${e}-play-pause`,role:"button",tabindex:"0","aria-controls":Z,"aria-label":G?"Start slide rotation":"Stop slide rotation",onClick:k}},getIndicatorProps(G){const K=o();if(G<0||G>=K)throw new Error(`Unknown carousel indicator index: ${G}`);const D=l()===G;return{id:`${e}-indicator-${G}`,role:"button",tabindex:"0","aria-controls":le(G),"aria-label":`Go to slide ${G+1}`,"aria-current":D?"true":void 0,"data-active":D?"true":"false",onClick:()=>B(G)}}},M={activeSlideIndex:l,isPaused:v,slideCount:o,visibleSlideIndices:g};return $(),{state:M,actions:z,contracts:O}}function Go(i,e,t){return i.trim().split(/\s+/).map(s=>{if(s.endsWith("%")){const a=parseFloat(s)/100;return e+a*(t-e)}return parseFloat(s)}).filter(s=>!isNaN(s))}function Wo(i,e,t,s,a){if(!e)return i;const r=Go(e,s,a);if(r.length===0)return i;const o=r[0];if(o===void 0)return i;let n=o,l=Math.abs(i-n);for(const d of r){const u=Math.abs(i-d);u<l&&(l=u,n=d)}return l<=t?n:i}const kt=(i,e,t)=>{const s=i();e();const a=i();a!==s&&t?.(a)};function Yo(i={}){const e=i.idBase??"window-splitter",t=w(i.orientation??"horizontal",`${e}.orientation`),s=w(!1,`${e}.isDragging`),a=i.isFixed??!1,r=i.snapThreshold??12,o=i.min??0,n=i.max??100,l=Ms({idBase:`${e}.range`,min:o,max:n,step:i.step,initialValue:i.position}),d=k=>{const S=l.state.min(),E=l.state.max(),F=tt(k,S,E),j=Wo(F,i.snap,r,S,E);l.actions.setValue(j)},u=c(k=>{kt(l.state.value,()=>{d(k)},i.onPositionChange)},`${e}.setPosition`),h=c(k=>{kt(l.state.value,()=>{k>0?l.actions.increment():l.actions.decrement()},i.onPositionChange)},`${e}.moveStep`),p=c(()=>{kt(l.state.value,()=>{l.actions.setFirst()},i.onPositionChange)},`${e}.moveToMin`),v=c(()=>{kt(l.state.value,()=>{l.actions.setLast()},i.onPositionChange)},`${e}.moveToMax`),g=()=>{if(!a)return;const k=l.state.min(),S=l.state.max(),E=k+(S-k)/2;l.state.value()<=E?v():p()},f=c(()=>{s.set(!0)},`${e}.startDragging`),x=c(()=>{s.set(!1)},`${e}.stopDragging`),m=c(k=>{const S=t();switch(k.key){case"ArrowLeft":!a&&S==="vertical"&&h(-1);return;case"ArrowRight":!a&&S==="vertical"&&h(1);return;case"ArrowUp":!a&&S==="horizontal"&&h(-1);return;case"ArrowDown":!a&&S==="horizontal"&&h(1);return;case"Home":p();return;case"End":v();return;case"Enter":g();return;default:return}},`${e}.handleKeyDown`),I={setPosition:u,moveStep:h,moveToMin:p,moveToMax:v,startDragging:f,stopDragging:x,handleKeyDown:m},$=`${e}-separator`,T=i.primaryPaneId??`${e}-pane-primary`,_=i.secondaryPaneId??`${e}-pane-secondary`,B=`${T} ${_}`,A={getSplitterProps(){const k=l.state.value();return{id:$,role:"separator",tabindex:"0","aria-valuenow":String(k),"aria-valuemin":String(l.state.min()),"aria-valuemax":String(l.state.max()),"aria-valuetext":i.formatValueText?.(k),"aria-orientation":t(),"aria-controls":B,"aria-label":i.ariaLabel,"aria-labelledby":i.ariaLabelledBy,onKeyDown:m}},getPrimaryPaneProps(){return{id:T,"data-pane":"primary","data-orientation":t()}},getSecondaryPaneProps(){return{id:_,"data-pane":"secondary","data-orientation":t()}}};return{state:{position:l.state.value,min:l.state.min,max:l.state.max,orientation:t,isDragging:s},actions:I,contracts:A}}const Xo=i=>i===" "||i==="Spacebar";function Zo(i={}){const e=i.idBase??"popover",t=$a({idBase:`${e}.overlay`,initialOpen:i.initialOpen,initialTriggerId:i.initialTriggerId??`${e}-trigger`,trapFocus:!1,restoreFocus:!0}),s=w(i.useNativePopover??!1,`${e}.useNativePopover`),a=ae(()=>t.state.isOpen(),`${e}.isInteractive`),r=c((m="programmatic")=>{t.actions.open(m,t.state.triggerId()??`${e}-trigger`)},`${e}.open`),o=c((m="programmatic")=>{t.actions.close(m)},`${e}.close`),n=c((m="programmatic")=>{if(t.state.isOpen()){o();return}r(m)},`${e}.toggle`),l=c(m=>{t.actions.setTrigger(m)},`${e}.setTriggerId`),d=c(m=>{(m.key==="Enter"||Xo(m.key)||m.key==="ArrowDown")&&n("keyboard")},`${e}.handleTriggerKeyDown`),u=c(m=>{i.closeOnEscape!==!1&&t.actions.handleKeyDown(m)},`${e}.handleContentKeyDown`),h=c(()=>{i.closeOnOutsidePointer!==!1&&t.actions.handleOutsidePointer()},`${e}.handleOutsidePointer`),p=c(()=>{i.closeOnOutsideFocus!==!1&&t.actions.handleOutsideFocus()},`${e}.handleOutsideFocus`),v=c(m=>{const I=t.state.isOpen();m==="closed"&&I?o():m==="open"&&!I&&r("programmatic")},`${e}.handleNativeToggle`),g={setTriggerId:l,open:r,close:o,toggle:n,handleTriggerKeyDown:d,handleContentKeyDown:u,handleOutsidePointer:h,handleOutsideFocus:p,handleNativeToggle:v},f={getTriggerProps(){const m=s(),I={id:t.state.triggerId()??`${e}-trigger`,role:"button",tabindex:"0","aria-haspopup":"dialog","aria-expanded":t.state.isOpen()?"true":"false","aria-controls":`${e}-content`,onClick:()=>n("pointer"),onKeyDown:d};return m&&(I.popovertarget=`${e}-content`,I.popovertargetaction="toggle"),I},getContentProps(){const m=s(),I={id:`${e}-content`,role:"dialog",tabindex:"-1","aria-modal":"false","aria-label":i.ariaLabel,"aria-labelledby":i.ariaLabelledBy,onKeyDown:u,onPointerDownOutside:h,onFocusOutside:p};return m?I.popover="manual":I.hidden=!t.state.isOpen(),I}};return{state:{isOpen:t.state.isOpen,triggerId:t.state.triggerId,openedBy:t.state.openedBy,restoreTargetId:t.state.restoreTargetId,lastDismissIntent:t.state.lastDismissIntent,isInteractive:a,useNativePopover:s},actions:g,contracts:f}}const Oi=i=>i===" "||i==="Spacebar";function Mi(i){const e=i.idBase??"select",t=i.closeOnSelect??!0,s=i.selectionMode??"single",a=s==="multiple",r=new Map(i.options.map(E=>[E.id,E])),o=ka({idBase:`${e}.listbox`,options:i.options,selectionMode:s,ariaLabel:i.ariaLabel,initialSelectedIds:i.initialSelectedIds??(i.initialSelectedId!=null?[i.initialSelectedId]:[])}),n=w(i.initialOpen??!1,`${e}.isOpen`),l=w(null,`${e}.restoreTargetId`),d=w(i.disabled??!1,`${e}.disabled`),u=w(i.required??!1,`${e}.required`),h=ae(()=>o.state.selectedIds()[0]??null,`${e}.selectedId`),p=ae(()=>{const E=h();if(E==null)return null;const F=r.get(E);return F?F.label??E:null},`${e}.selectedLabel`),v=ae(()=>o.state.selectedIds().map(E=>r.get(E)).filter(E=>E!=null).map(E=>E.label??E.id),`${e}.selectedLabels`),g=E=>{if(!d())switch(n.set(!0),o.actions.open(),l.set(null),E){case"first":o.actions.moveFirst();return;case"last":o.actions.moveLast();return;case"selected":{const F=h();if(F!=null){o.actions.setActive(F);return}o.actions.moveFirst()}}},f=c(()=>{g("selected")},`${e}.open`),x=c(()=>{n.set(!1),o.actions.close(),l.set(`${e}-trigger`)},`${e}.close`),m=c(()=>{if(!d()){if(n()){x();return}f()}},`${e}.toggle`),I=c(E=>{if(d())return;const F=h();a?o.actions.toggleSelected(E):o.actions.selectOnly(E);const j=h();F!==j&&i.onSelectedIdChange?.(j),t&&x()},`${e}.select`),$=c(()=>{if(d())return;const E=h();o.actions.clearSelected();const F=h();E!==F&&i.onSelectedIdChange?.(F)},`${e}.clear`),T=c(E=>{d.set(E)},`${e}.setDisabled`),_=c(E=>{u.set(E)},`${e}.setRequired`),B=c(E=>{if(!d()){if(E.key==="ArrowDown"||E.key==="Home"){g("first");return}if(E.key==="ArrowUp"||E.key==="End"){g("last");return}(E.key==="Enter"||Oi(E.key))&&m()}},`${e}.handleTriggerKeyDown`),A=c(E=>{if(!d()&&n()){if(E.key==="Escape"||E.key==="Tab"){x();return}if(E.key==="Enter"||Oi(E.key)){const F=o.state.activeId();F!=null&&I(F);return}o.actions.handleKeyDown({key:E.key,shiftKey:E.shiftKey??!1,ctrlKey:E.ctrlKey??!1,metaKey:E.metaKey??!1,altKey:E.altKey??!1})}},`${e}.handleListboxKeyDown`),N={open:f,close:x,toggle:m,select:I,clear:$,setDisabled:T,setRequired:_,handleTriggerKeyDown:B,handleListboxKeyDown:A},k={getTriggerProps(){const E=n(),F=o.state.activeId(),j=d(),X=u();let oe;return E&&F!=null&&(oe=o.contracts.getOptionProps(F).id),{id:`${e}-trigger`,role:"combobox",tabindex:"0","aria-haspopup":"listbox","aria-expanded":E?"true":"false","aria-controls":`${e}-listbox`,"aria-activedescendant":oe,"aria-label":i.ariaLabel,"aria-disabled":j?"true":void 0,"aria-required":X?"true":void 0,"data-selected-id":h()??void 0,"data-selected-label":p()??void 0,onClick:m,onKeyDown:B}},getListboxProps(){const E=o.contracts.getRootProps();return{id:`${e}-listbox`,role:"listbox",tabindex:n()?"0":"-1","aria-label":E["aria-label"],"aria-activedescendant":E["aria-activedescendant"],"aria-multiselectable":a?"true":void 0,hidden:!n(),onKeyDown:A}},getOptionProps(E){const F=o.contracts.getOptionProps(E);return{id:F.id,role:"option",tabindex:"-1","aria-selected":F["aria-selected"]??"false","aria-disabled":F["aria-disabled"],"data-active":F["data-active"]??"false",onClick:()=>I(E)}},getValueText(){const E=v();return E.length===0?i.placeholder??"":a?E.join(", "):E[0]??i.placeholder??""}};return{state:{isOpen:n,activeId:o.state.activeId,selectedIds:o.state.selectedIds,selectedId:h,selectedLabel:p,selectedLabels:v,restoreTargetId:l,disabled:d,required:u},actions:N,contracts:k}}const Qo=i=>i.type==null||i.type==="item"||i.type==="checkbox"||i.type==="radio"||i.type==="submenu",Jo=i=>{const e=new Map;for(const t of i)if(e.set(t.id,t),t.type==="submenu"&&t.children)for(const s of t.children)e.set(s.id,s);return e},en=500;function tn(i){const e=i.idBase??"context-menu",t=i.longPressDuration??500,s=Jo(i.items),a=i.items.filter(Qo).map(z=>({id:z.id,label:z.label,disabled:z.disabled})),r=w(0,`${e}.anchorX`),o=w(0,`${e}.anchorY`),n=w(null,`${e}.openedBy`),l=w(null,`${e}.restoreTargetId`),d=new Set;for(const z of i.items)(z.type==="checkbox"||z.type==="radio")&&z.checked&&d.add(z.id);const u=w(d,`${e}.checkedIds`),h=w(null,`${e}.openSubmenuId`),p=w(null,`${e}.submenuActiveId`),v=new Map;for(const z of i.items)if(z.type==="submenu"&&z.children){const O=z.children.filter(M=>!M.disabled).map(M=>M.id);v.set(z.id,{enabledIds:O,allChildren:z.children})}let g=st();const f=a.filter(z=>!z.disabled&&z.label!=null).map(z=>({id:z.id,text:Fe(z.label)}));let x=null;const m=Ts({idBase:e,items:a,ariaLabel:i.ariaLabel,closeOnSelect:i.closeOnSelect}),I=()=>{x!=null&&(clearTimeout(x),x=null)},$=c((z,O,M="programmatic")=>{r.set(z),o.set(O),n.set(M),l.set(null),h.set(null),p.set(null),m.actions.open(M)},`${e}.openAt`),T=c(()=>{m.actions.close(),m.actions.setActive(null),n.set(null),l.set(`${e}-target`),h.set(null),p.set(null)},`${e}.close`),_=()=>{h.set(null),p.set(null)},B=z=>{const O=s.get(z);if(!O)return!1;if(O.type==="checkbox"){const M=new Set(u());return M.has(z)?M.delete(z):M.add(z),u.set(M),!0}if(O.type==="radio"&&O.group){const M=new Set(u());for(const G of i.items)G.type==="radio"&&G.group===O.group&&M.delete(G.id);return M.add(z),u.set(M),!0}return!1},A=c(z=>{const O=s.get(z);if(!O||O.disabled||O.type==="separator"||O.type==="group-label")return;if(B(z),!a.some(K=>K.id===z)){(i.closeOnSelect??!0)&&T();return}const G=m.state.isOpen();m.actions.select(z),G&&!m.state.isOpen()&&(n.set(null),l.set(`${e}-target`),h.set(null),p.set(null))},`${e}.select`),N=c(z=>{const O=z.key==="ContextMenu",M=z.key==="F10"&&z.shiftKey===!0;(O||M)&&$(r(),o(),"keyboard")},`${e}.handleTargetKeyDown`),k=z=>{const O=h();if(O==null)return!1;const M=v.get(O);if(!M)return!1;if(z.key==="Escape"||z.key==="ArrowLeft")return _(),!0;if(z.key==="ArrowDown"){const G=p(),D=((G!=null?M.enabledIds.indexOf(G):-1)+1)%M.enabledIds.length;return p.set(M.enabledIds[D]??null),!0}if(z.key==="ArrowUp"){const G=p(),D=((G!=null?M.enabledIds.indexOf(G):0)-1+M.enabledIds.length)%M.enabledIds.length;return p.set(M.enabledIds[D]??null),!0}if(z.key==="Home")return p.set(M.enabledIds[0]??null),!0;if(z.key==="End")return p.set(M.enabledIds[M.enabledIds.length-1]??null),!0;if(z.key==="Enter"||z.key===" "){const G=p();return G!=null&&A(G),!0}return!1},S=c(z=>{if(!m.state.isOpen())return;const O={key:z.key,shiftKey:z.shiftKey??!1,ctrlKey:z.ctrlKey??!1,metaKey:z.metaKey??!1,altKey:z.altKey??!1};if(!k(z)){if(z.key==="Escape"||z.key==="Tab"){T();return}if(z.key==="ArrowRight"){const M=m.state.activeId();if(M!=null&&v.has(M)){const G=v.get(M);h.set(M),p.set(G.enabledIds[0]??null);return}}if(pt(O)){const{query:M,next:G}=Ht(g,z.key,Date.now(),en);g=G;const K=m.state.activeId(),D=K!=null?f.findIndex(H=>H.id===K):0,C=mt(M,f,D>=0?D:0);C!=null&&m.actions.setActive(C);return}m.actions.handleMenuKeyDown(O)}},`${e}.handleKeyDown`),E=c(()=>{i.closeOnOutsidePointer!==!1&&m.state.isOpen()&&T()},`${e}.handleOutsidePointer`),F=c(z=>{I(),x=setTimeout(()=>{$(z.clientX,z.clientY,"pointer"),x=null},t)},`${e}.handleTouchStart`),j=c(()=>{I()},`${e}.handleTouchMove`),X=c(()=>{I()},`${e}.handleTouchEnd`),oe={openAt:$,close:T,select:A,handleTargetKeyDown:N,handleKeyDown:S,handleOutsidePointer:E,handleTouchStart:F,handleTouchMove:j,handleTouchEnd:X},Z={getTargetProps(){return{id:`${e}-target`,onContextMenu:z=>{z.preventDefault?.(),$(z.clientX,z.clientY,"pointer")},onKeyDown:N}},getMenuProps(){return{...m.contracts.getMenuProps(),hidden:!m.state.isOpen(),"data-anchor-x":String(r()),"data-anchor-y":String(o()),onKeyDown:S}},getItemProps(z){const O=s.get(z);if(!O)throw new Error(`Unknown context-menu item id: ${z}`);const M=O.type??"item";if(M==="submenu"){const D=m.contracts.getItemProps(z),C=h()===z;return{...D,role:"menuitem","aria-haspopup":"menu","aria-expanded":C?"true":"false",onClick:()=>A(z)}}if(M==="checkbox"){const D=m.contracts.getItemProps(z),C=u().has(z);return{...D,role:"menuitemcheckbox","aria-checked":C?"true":"false",onClick:()=>A(z)}}if(M==="radio"){const D=m.contracts.getItemProps(z),C=u().has(z);return{...D,role:"menuitemradio","aria-checked":C?"true":"false",onClick:()=>A(z)}}if(!a.some(D=>D.id===z)){const D=p();return{id:`${e}-item-${z}`,role:"menuitem",tabindex:"-1","aria-disabled":O.disabled?"true":void 0,"data-active":D===z?"true":"false",onClick:()=>A(z)}}return{...m.contracts.getItemProps(z),onClick:()=>A(z)}},getSeparatorProps(z){return{id:`${e}-separator-${z}`,role:"separator"}},getGroupLabelProps(z){const O=s.get(z);return{id:`${e}-group-${z}`,role:"presentation","aria-label":O?.label}},getSubmenuProps(z){return{id:`${e}-submenu-${z}`,role:"menu",tabindex:"-1",hidden:h()!==z}}};return{state:{isOpen:m.state.isOpen,activeId:m.state.activeId,anchorX:r,anchorY:o,openedBy:n,restoreTargetId:l,checkedIds:u,openSubmenuId:h,submenuActiveId:p},actions:oe,contracts:Z}}function sn(i){const e=i.idBase??"command-palette",t=i.openShortcutKey??"k",s=i.closeOnExecute??!0,a=new Set(i.commands.map($=>$.id)),r=w(null,`${e}.lastExecutedId`),o=w(null,`${e}.restoreTargetId`),n=Ia({idBase:`${e}.combobox`,options:i.commands,ariaLabel:i.ariaLabel,initialOpen:i.initialOpen??!1}),l=c(()=>{n.actions.open(),o.set(null)},`${e}.open`),d=c(()=>{n.actions.close(),o.set(`${e}-trigger`)},`${e}.close`),u=c(()=>{if(n.state.isOpen()){d();return}l()},`${e}.toggle`),h=c($=>{a.has($)&&(n.state.selectedId.set($),n.state.activeId.set($),r.set($),i.onExecute?.($),s&&d())},`${e}.execute`),p=c($=>{n.actions.setInputValue($)},`${e}.setInputValue`),v=c($=>{($.ctrlKey===!0||$.metaKey===!0)&&$.key.toLowerCase()===t&&u()},`${e}.handleGlobalKeyDown`),g=c($=>{if(n.state.isOpen()){if($.key==="Escape"){d();return}if($.key==="Enter"||$.key===" "){const T=n.state.activeId()??n.contracts.getFlatVisibleOptions().find(_=>!_.disabled)?.id??null;T!=null&&h(T);return}n.actions.handleKeyDown({key:$.key,shiftKey:$.shiftKey??!1,ctrlKey:$.ctrlKey??!1,metaKey:$.metaKey??!1,altKey:$.altKey??!1})}},`${e}.handlePaletteKeyDown`),f=c(()=>{i.closeOnOutsidePointer!==!1&&d()},`${e}.handleOutsidePointer`),x={open:l,close:d,toggle:u,execute:h,setInputValue:p,handleGlobalKeyDown:v,handlePaletteKeyDown:g,handleOutsidePointer:f},m={getTriggerProps(){return{id:`${e}-trigger`,role:"button",tabindex:"0","aria-haspopup":"dialog","aria-expanded":n.state.isOpen()?"true":"false","aria-controls":`${e}-dialog`,onClick:u}},getDialogProps(){return{id:`${e}-dialog`,role:"dialog",tabindex:"-1",hidden:!n.state.isOpen(),"aria-modal":"true","aria-label":i.ariaLabel,onKeyDown:g,onPointerDownOutside:f}},getInputProps(){return n.contracts.getInputProps()},getListboxProps(){return n.contracts.getListboxProps()},getOptionProps($){return{...n.contracts.getOptionProps($),onClick:()=>h($)}},getVisibleCommands(){return n.contracts.getVisibleOptions()}},I={isOpen:n.state.isOpen,inputValue:n.state.inputValue,activeId:n.state.activeId,selectedId:n.state.selectedId,lastExecutedId:r,restoreTargetId:o};return i.initialOpen&&l(),{state:I,actions:x,contracts:m}}function an(i={}){const e=i.idBase??"toast",t=Math.max(i.maxVisible??3,1),s=Math.max(i.defaultDurationMs??5e3,0),a=i.ariaLive??"polite",r=w([...i.initialItems??[]],`${e}.items`),o=w(!1,`${e}.isPaused`),n=ae(()=>r().slice(0,t),`${e}.visibleItems`),l=new Map,d=new Map,u=new Map;let h=0;const p=A=>{const N=l.get(A);N!=null&&(clearTimeout(N),l.delete(A))},v=A=>{p(A),d.delete(A),u.delete(A)},g=c(A=>{v(A),r.set(r().filter(N=>N.id!==A))},`${e}.dismiss`),f=(A,N)=>{if(N<=0)return;if(o()){d.set(A,N),u.delete(A);return}p(A),d.set(A,N),u.set(A,Date.now());const k=setTimeout(()=>{v(A),g(A)},N);l.set(A,k)},x=c(A=>{const N=A.id??`${e}-${++h}`,k={id:N,message:A.message,title:A.title,level:A.level??"info",durationMs:A.durationMs??s,closable:A.closable??!0,icon:A.icon,progress:A.progress,actions:A.actions};return r.set([k,...r()]),f(N,k.durationMs??s),N},`${e}.push`),m=c(()=>{for(const A of r())v(A.id);r.set([])},`${e}.clear`),I=c(()=>{if(o())return;o.set(!0);const A=Date.now();for(const N of l.keys()){const k=u.get(N)??A,S=d.get(N)??0,E=Math.max(A-k,0),F=Math.max(S-E,0);d.set(N,F),u.delete(N),p(N)}},`${e}.pause`),$=c(()=>{if(o()){o.set(!1);for(const A of r()){const N=d.get(A.id)??A.durationMs??s;f(A.id,N)}}},`${e}.resume`),T={push:x,dismiss:g,clear:m,pause:I,resume:$},_={getRegionProps(){return{id:`${e}-region`,role:"region","aria-live":a,"aria-atomic":"false"}},getToastProps(A){const N=r().find(S=>S.id===A);if(!N)throw new Error(`Unknown toast id: ${A}`);const k=N.level??"info";return{id:`${e}-item-${A}`,role:k==="error"||k==="warning"?"alert":"status","data-level":k}},getDismissButtonProps(A){return{id:`${e}-dismiss-${A}`,role:"button",tabindex:"0","aria-label":"Dismiss notification",onClick:()=>g(A)}}},B={items:r,visibleItems:n,isPaused:o};for(const A of r())f(A.id,A.durationMs??s);return{state:B,actions:T,contracts:_}}function Aa(i={}){const e=i.idBase??"progress",t=w(i.isIndeterminate??!1,`${e}.isIndeterminate`),s=Ms({idBase:`${e}.range`,min:i.min??0,max:i.max??100,step:i.step,initialValue:i.value}),a=v=>{const g=s.state.value();v();const f=s.state.value();g!==f&&i.onValueChange?.(f)},r=c(v=>{a(()=>{s.actions.setValue(v)})},`${e}.setValue`),o=c(()=>{a(()=>{s.actions.increment()})},`${e}.increment`),n=c(()=>{a(()=>{s.actions.decrement()})},`${e}.decrement`),l=c(v=>{t.set(v)},`${e}.setIndeterminate`),d=ae(()=>!t()&&s.state.value()>=s.state.max(),`${e}.isComplete`),u={setValue:r,increment:o,decrement:n,setIndeterminate:l},h={getProgressProps(){const v=s.state.value(),g=t(),f=`${Math.round(s.state.percentage())}%`;return{id:`${e}-root`,role:"progressbar","aria-valuenow":g?void 0:String(v),"aria-valuemin":g?void 0:String(s.state.min()),"aria-valuemax":g?void 0:String(s.state.max()),"aria-valuetext":g?void 0:i.valueText??i.formatValueText?.(v)??f,"aria-label":i.ariaLabel,"aria-labelledby":i.ariaLabelledBy,"aria-describedby":i.ariaDescribedBy}}};return{state:{value:s.state.value,min:s.state.min,max:s.state.max,percentage:s.state.percentage,isIndeterminate:t,isComplete:d},actions:u,contracts:h}}function rn(i={}){const e=i.idBase??"input",t=w(i.value??"",`${e}.value`),s=w(i.type??"text",`${e}.type`),a=w(i.disabled??!1,`${e}.disabled`),r=w(i.readonly??!1,`${e}.readonly`),o=w(i.required??!1,`${e}.required`),n=w(i.placeholder??"",`${e}.placeholder`),l=w(i.clearable??!1,`${e}.clearable`),d=w(i.passwordToggle??!1,`${e}.passwordToggle`),u=w(!1,`${e}.passwordVisible`),h=w(!1,`${e}.focused`),p=()=>t().length>0,v=()=>{const Z=s(),le=u();return Z==="password"&&le?"text":Z},g=()=>l()&&p()&&!a()&&!r(),f=()=>s()==="password"&&d(),x=c(Z=>{t.set(Z),i.onInput?.(Z)},`${e}.setValue`),m=c(Z=>{s.set(Z),u.set(!1)},`${e}.setType`),I=c(Z=>{a.set(Z)},`${e}.setDisabled`),$=c(Z=>{r.set(Z)},`${e}.setReadonly`),T=c(Z=>{o.set(Z)},`${e}.setRequired`),_=c(Z=>{n.set(Z)},`${e}.setPlaceholder`),B=c(Z=>{l.set(Z)},`${e}.setClearable`),A=c(Z=>{d.set(Z),Z||u.set(!1)},`${e}.setPasswordToggle`),N=c(()=>{s()!=="password"||!d()||u.set(!u())},`${e}.togglePasswordVisibility`),k=c(Z=>{h.set(Z)},`${e}.setFocused`),S=c(()=>{a()||r()||(t.set(""),i.onClear?.())},`${e}.clear`),E=c(Z=>{a()||r()||x(Z)},`${e}.handleInput`),F=c(Z=>{Z.key==="Escape"&&l()&&p()&&!a()&&!r()&&S()},`${e}.handleKeyDown`);return{state:{value:t,type:s,disabled:a,readonly:r,required:o,placeholder:n,clearable:l,passwordToggle:d,passwordVisible:u,focused:h,filled:p,resolvedType:v,showClearButton:g,showPasswordToggle:f},actions:{setValue:x,setType:m,setDisabled:I,setReadonly:$,setRequired:T,setPlaceholder:_,setClearable:B,setPasswordToggle:A,togglePasswordVisibility:N,setFocused:k,clear:S,handleInput:E,handleKeyDown:F},contracts:{getInputProps(){const Z=a(),le=r(),z=o(),O=n(),M=s();return{id:`${e}-input`,type:v(),"aria-disabled":Z?"true":void 0,"aria-readonly":le?"true":void 0,"aria-required":z?"true":void 0,placeholder:O||void 0,disabled:Z||void 0,readonly:le||void 0,tabindex:Z?"-1":"0",autocomplete:M==="password"?"off":void 0}},getClearButtonProps(){const Z=g();return{role:"button","aria-label":"Clear input",tabindex:"-1",hidden:Z?void 0:!0,"aria-hidden":Z?void 0:"true"}},getPasswordToggleProps(){const Z=f(),le=u();return{role:"button","aria-label":le?"Hide password":"Show password","aria-pressed":le?"true":"false",tabindex:Z?"0":"-1",hidden:Z?void 0:!0,"aria-hidden":Z?void 0:"true"}}}}}const Ri=new Set(["primary","success","neutral","warning","danger"]),Ti=new Set(["small","medium","large"]);function on(i={}){const e=Ri.has(i.variant)?i.variant:"neutral",t=Ti.has(i.size)?i.size:"medium",s=w(e,"badge.variant"),a=w(t,"badge.size"),r=w(i.dot??!1,"badge.dot"),o=w(i.pulse??!1,"badge.pulse"),n=w(i.pill??!1,"badge.pill"),l=w(i.isDynamic??!1,"badge.isDynamic"),d=w(i.isDecorative??!1,"badge.isDecorative"),u=ae(()=>r(),"badge.isEmpty"),h={setVariant:c(g=>{Ri.has(g)&&s.set(g)},"badge.setVariant"),setSize:c(g=>{Ti.has(g)&&a.set(g)},"badge.setSize"),setDot:c(g=>{r.set(g)},"badge.setDot"),setPulse:c(g=>{o.set(g)},"badge.setPulse"),setPill:c(g=>{n.set(g)},"badge.setPill"),setDynamic:c(g=>{l.set(g)},"badge.setDynamic"),setDecorative:c(g=>{d.set(g)},"badge.setDecorative")};return{state:{variant:s,size:a,dot:r,pulse:o,pill:n,isDynamic:l,isDecorative:d,isEmpty:u},actions:h,contracts:{getBadgeProps(){if(d())return{role:"presentation","aria-hidden":"true"};if(l()){const f={role:"status","aria-live":"polite","aria-atomic":"true"};return i.ariaLabel!=null&&(f["aria-label"]=i.ariaLabel),f}const g={};return i.ariaLabel!=null&&(g["aria-label"]=i.ariaLabel),g}}}}const nn=i=>i===" "||i==="Spacebar";function ln(i={}){const e=i.idBase??"card",t=w(i.isExpandable??!1,`${e}.isExpandable`),s=w(i.isExpanded??!1,`${e}.isExpanded`),a=w(i.isDisabled??!1,`${e}.isDisabled`),r=m=>{s()!==m&&(s.set(m),i.onExpandedChange?.(m))},o=c(()=>{!t()||a()||r(!s())},`${e}.toggle`),n=c(()=>{!t()||a()||r(!0)},`${e}.expand`),l=c(()=>{!t()||a()||r(!1)},`${e}.collapse`),d=c(m=>{a.set(m)},`${e}.setDisabled`),u=c(()=>{o()},`${e}.handleClick`),h=c(m=>{if(!(!t()||a())){if(m.key==="Enter"||nn(m.key)){m.preventDefault?.(),o();return}if(m.key==="ArrowDown"||m.key==="ArrowRight"){m.preventDefault?.(),n();return}if(m.key==="ArrowUp"||m.key==="ArrowLeft"){m.preventDefault?.(),l();return}}},`${e}.handleKeyDown`),p=`${e}-trigger`,v=`${e}-content`;return{state:{isExpandable:t,isExpanded:s,isDisabled:a},actions:{toggle:o,expand:n,collapse:l,setDisabled:d,handleClick:u,handleKeyDown:h},contracts:{getCardProps(){return{}},getTriggerProps(){return t()?{id:p,role:"button",tabindex:a()?"-1":"0","aria-expanded":s()?"true":"false","aria-controls":v,"aria-disabled":a()?"true":void 0,onClick:u,onKeyDown:h}:{}},getContentProps(){return t()?{id:v,role:"region","aria-labelledby":p,hidden:!s()}:{}}}}}const Bi=i=>Math.max(0,i),Pi=i=>i===" "||i==="Spacebar",cn={idle:"copy",success:"success",error:"error"};function dn(i={}){const e=i.clipboard??navigator.clipboard,t=w("idle","copyButton.status"),s=w(i.isDisabled??!1,"copyButton.isDisabled"),a=w(!1,"copyButton.isCopying"),r=w(Bi(i.feedbackDuration??1500),"copyButton.feedbackDuration"),o=w({ref:i.value??""},"copyButton.value"),n=()=>o().ref;n.set=F=>o.set({ref:F});const l=n,d=ae(()=>t()==="idle","copyButton.isIdle"),u=ae(()=>t()==="success","copyButton.isSuccess"),h=ae(()=>t()==="error","copyButton.isError"),p=ae(()=>s()||a(),"copyButton.isUnavailable");let v=null,g=0;const f=()=>{v!==null&&(clearTimeout(v),v=null)},x=F=>{f(),v=setTimeout(()=>{v=null,g===F&&t.set("idle")},r())},m=async()=>{if(p())return;const F=++g;a.set(!0),f();let j;try{const X=l();typeof X=="function"?j=await X():j=X}catch(X){if(a.set(!1),g!==F)return;t.set("error"),i.onError?.(X),x(F);return}try{if(await e.writeText(j),a.set(!1),g!==F)return;t.set("success"),i.onCopy?.(j)}catch(X){if(a.set(!1),g!==F)return;t.set("error"),i.onError?.(X)}x(F)},I=c(F=>{s.set(F)},"copyButton.setDisabled"),$=c(F=>{r.set(Bi(F))},"copyButton.setFeedbackDuration"),T=c(F=>{l.set(F)},"copyButton.setValue"),_=c(()=>{++g,f(),a.set(!1),t.set("idle")},"copyButton.reset");return{state:{status:t,isDisabled:s,isCopying:a,feedbackDuration:r,value:l,isIdle:d,isSuccess:u,isError:h,isUnavailable:p},actions:{copy:m,setDisabled:I,setFeedbackDuration:$,setValue:T,reset:_},contracts:{getButtonProps:()=>{const F=p(),j=t();let X;i.ariaLabel!=null&&(j==="idle"?X=i.ariaLabel:j==="success"?X="Copied":X="Copy failed");const oe={role:"button",tabindex:F?"-1":"0","aria-disabled":F?"true":"false",onClick:Z=>{m()},onKeyDown:Z=>{if(!p()){if(Z.key==="Enter"){m();return}Pi(Z.key)&&Z.preventDefault()}},onKeyUp:Z=>{p()||Pi(Z.key)&&m()}};return X!==void 0&&(oe["aria-label"]=X),oe},getStatusProps:()=>({role:"status","aria-live":"polite","aria-atomic":"true"}),getIconContainerProps:F=>{const j=cn[t()],X={"aria-hidden":"true"};return F!==j&&(X.hidden=!0),X}}}}function un(i={}){const e=i.idBase??"number",t=Ea({idBase:e,value:i.value,min:i.min,max:i.max,step:i.step,largeStep:i.largeStep,isDisabled:i.disabled,isReadOnly:i.readonly,ariaLabel:i.ariaLabel,ariaLabelledBy:i.ariaLabelledBy,ariaDescribedBy:i.ariaDescribedBy,formatValueText:i.formatValueText,onValueChange:i.onValueChange}),s=w(!1,`${e}.focused`),a=w(i.clearable??!1,`${e}.clearable`),r=w(i.stepper??!1,`${e}.stepper`),o=w(null,`${e}.draftText`),n=w(i.placeholder??"",`${e}.placeholder`),l=w(i.required??!1,`${e}.required`),d=i.defaultValue??i.min??0,u=w(d,`${e}.defaultValue`),h=()=>t.state.value()!==u(),p=()=>a()&&h()&&!t.state.isDisabled()&&!t.state.isReadOnly(),v=M=>{const G=t.state.isDisabled(),K=t.state.isReadOnly();G&&t.actions.setDisabled(!1),K&&t.actions.setReadOnly(!1),t.actions.setValue(M),G&&t.actions.setDisabled(!0),K&&t.actions.setReadOnly(!0)},g=c(M=>{v(M),o.set(null)},`${e}.setValue`),f=c(()=>{t.actions.increment(),o.set(null)},`${e}.increment`),x=c(()=>{t.actions.decrement(),o.set(null)},`${e}.decrement`),m=c(()=>{t.actions.incrementLarge(),o.set(null)},`${e}.incrementLarge`),I=c(()=>{t.actions.decrementLarge(),o.set(null)},`${e}.decrementLarge`),$=c(()=>{t.actions.setFirst(),o.set(null)},`${e}.setFirst`),T=c(()=>{t.actions.setLast(),o.set(null)},`${e}.setLast`),_=c(M=>{t.actions.setDisabled(M)},`${e}.setDisabled`),B=c(M=>{t.actions.setReadOnly(M)},`${e}.setReadOnly`),A=c(M=>{l.set(M)},`${e}.setRequired`),N=c(M=>{a.set(M)},`${e}.setClearable`),k=c(M=>{r.set(M)},`${e}.setStepper`),S=c(M=>{n.set(M)},`${e}.setPlaceholder`),E=c(M=>{o.set(M)},`${e}.setDraftText`),F=c(()=>{t.state.isDisabled()||t.state.isReadOnly()||(v(u()),o.set(null),i.onClear?.())},`${e}.clear`),j=c(()=>{const M=o();if(M===null)return;if(M.trim()===""){F();return}const G=parseFloat(M);Number.isFinite(G)&&v(G),o.set(null)},`${e}.commitDraft`),X=c(M=>{t.state.isDisabled()||t.state.isReadOnly()||o.set(M)},`${e}.handleInput`),oe=c(M=>{s.set(M),M||j()},`${e}.setFocused`),Z=c(M=>{if(M.key==="Escape"){a()&&h()&&!t.state.isDisabled()&&!t.state.isReadOnly()&&(F(),M.preventDefault?.());return}if(M.key==="Enter"){j(),M.preventDefault?.();return}t.actions.handleKeyDown(M),o.set(null)},`${e}.handleKeyDown`),le={getInputProps(){const M=t.state.value(),G=t.state.isDisabled(),K=t.state.isReadOnly(),D=l(),C=n(),H=t.state.min(),Y=t.state.max();return{id:`${e}-input`,role:"spinbutton",tabindex:G?"-1":"0",inputmode:"decimal","aria-valuenow":String(M),"aria-valuemin":H!=null?String(H):void 0,"aria-valuemax":Y!=null?String(Y):void 0,"aria-valuetext":i.formatValueText?.(M),"aria-disabled":G?"true":void 0,"aria-readonly":K?"true":void 0,"aria-required":D?"true":void 0,"aria-label":i.ariaLabel,"aria-labelledby":i.ariaLabelledBy,"aria-describedby":i.ariaDescribedBy,placeholder:C||void 0,autocomplete:"off"}},getIncrementButtonProps(){const M=t.contracts.getIncrementButtonProps(),G=!r();return{id:M.id,tabindex:M.tabindex,"aria-label":M["aria-label"],"aria-disabled":M["aria-disabled"],hidden:G?!0:void 0,"aria-hidden":G?"true":void 0,onClick:f}},getDecrementButtonProps(){const M=t.contracts.getDecrementButtonProps(),G=!r();return{id:M.id,tabindex:M.tabindex,"aria-label":M["aria-label"],"aria-disabled":M["aria-disabled"],hidden:G?!0:void 0,"aria-hidden":G?"true":void 0,onClick:x}},getClearButtonProps(){const M=p();return{role:"button","aria-label":"Clear value",tabindex:"-1",hidden:M?void 0:!0,"aria-hidden":M?void 0:"true",onClick:F}}};return{state:{value:t.state.value,min:t.state.min,max:t.state.max,step:t.state.step,largeStep:t.state.largeStep,isDisabled:t.state.isDisabled,isReadOnly:t.state.isReadOnly,hasMin:()=>t.state.hasMin(),hasMax:()=>t.state.hasMax(),focused:s,filled:h,clearable:a,showClearButton:p,stepper:r,draftText:o,placeholder:n,required:l,defaultValue:u},actions:{setValue:g,increment:f,decrement:x,incrementLarge:m,decrementLarge:I,setFirst:$,setLast:T,handleKeyDown:Z,setDisabled:_,setReadOnly:B,setRequired:A,setClearable:N,setStepper:k,setFocused:oe,setPlaceholder:S,setDraftText:E,commitDraft:j,clear:F,handleInput:X},contracts:le}}const It=i=>{if(!(typeof i!="number"||!Number.isFinite(i)||i<=0))return Math.floor(i)},St=i=>{if(i!==void 0&&!(!Number.isFinite(i)||i<0))return Math.floor(i)},Fi=i=>i==="none"?"none":"vertical";function hn(i={}){const e=i.idBase??"textarea",t=w(i.value??"",`${e}.value`),s=w(i.disabled??!1,`${e}.disabled`),a=w(i.readonly??!1,`${e}.readonly`),r=w(i.required??!1,`${e}.required`),o=w(i.placeholder??"",`${e}.placeholder`),n=w(It(i.rows)??4,`${e}.rows`),l=w(It(i.cols)??20,`${e}.cols`),d=w(St(i.minLength),`${e}.minLength`),u=w(St(i.maxLength),`${e}.maxLength`),h=w(Fi(i.resize),`${e}.resize`),p=w(!1,`${e}.focused`),v=()=>t().length>0,g=c(j=>{t.set(j)},`${e}.setValue`),f=c(j=>{s.set(j)},`${e}.setDisabled`),x=c(j=>{a.set(j)},`${e}.setReadonly`),m=c(j=>{r.set(j)},`${e}.setRequired`),I=c(j=>{o.set(j)},`${e}.setPlaceholder`),$=c(j=>{const X=It(j);X!==void 0&&n.set(X)},`${e}.setRows`),T=c(j=>{const X=It(j);X!==void 0&&l.set(X)},`${e}.setCols`),_=c(j=>{d.set(St(j))},`${e}.setMinLength`),B=c(j=>{u.set(St(j))},`${e}.setMaxLength`),A=c(j=>{h.set(Fi(j))},`${e}.setResize`),N=c(j=>{p.set(j)},`${e}.setFocused`),k=c(j=>{s()||a()||(t.set(j),i.onInput?.(j))},`${e}.handleInput`);return{state:{value:t,disabled:s,readonly:a,required:r,placeholder:o,rows:n,cols:l,minLength:d,maxLength:u,resize:h,focused:p,filled:v},actions:{setValue:g,setDisabled:f,setReadonly:x,setRequired:m,setPlaceholder:I,setRows:$,setCols:T,setMinLength:_,setMaxLength:B,setResize:A,setFocused:N,handleInput:k},contracts:{getTextareaProps(){const j=s(),X=a(),oe=r(),Z=o(),le=d(),z=u();return{id:`${e}-textarea`,"aria-disabled":j?"true":void 0,"aria-readonly":X?"true":void 0,"aria-required":oe?"true":void 0,placeholder:Z||void 0,disabled:j||void 0,readonly:X||void 0,required:oe||void 0,tabindex:j?"-1":"0",rows:n(),cols:l(),minlength:le,maxlength:z}}}}}function pn(i={}){const e=w(i.label??"Loading","spinner.label"),t={setLabel:c(r=>{e.set(r)},"spinner.setLabel")};return{state:{label:e},actions:t,contracts:{getSpinnerProps(){return{role:"progressbar","aria-label":e()}}}}}function mn(i={}){const e=i.idBase??"drawer",t=jt({...i,idBase:e}),s=w(i.placement??"end",`${e}.placement`),a={...t.state,placement:s},r={...t.actions,setPlacement(n){s.set(n)}},o={getTriggerProps:t.contracts.getTriggerProps,getOverlayProps:t.contracts.getOverlayProps,getPanelProps(){return{...t.contracts.getContentProps(),"data-placement":s()}},getTitleProps:t.contracts.getTitleProps,getDescriptionProps:t.contracts.getDescriptionProps,getCloseButtonProps:t.contracts.getCloseButtonProps,getHeaderCloseButtonProps:t.contracts.getHeaderCloseButtonProps};return{state:a,actions:r,contracts:o}}const Ni=new Set(["info","success","warning","danger","neutral"]);function vn(i={}){const e=i.idBase??"callout",t=Ni.has(i.variant)?i.variant:"info",s=w(t,`${e}.variant`),a=w(i.closable??!1,`${e}.closable`),r=w(i.open??!0,`${e}.open`),o=c(()=>{a()&&r.set(!1)},`${e}.close`),n=c(()=>{r.set(!0)},`${e}.show`),l={setVariant:c(h=>{Ni.has(h)&&s.set(h)},`${e}.setVariant`),setClosable:c(h=>{a.set(h)},`${e}.setClosable`),close:o,show:n};return{state:{variant:s,closable:a,open:r},actions:l,contracts:{getCalloutProps(){return{id:`${e}-root`,role:"note","data-variant":s()}},getCloseButtonProps(){return{id:`${e}-close-btn`,role:"button",tabindex:"0","aria-label":"Dismiss",onClick:()=>o()}}}}}function fn(i={}){const e=i.id??"sidebar",t=i.defaultExpanded??!0,s=i.closeOnEscape??!0,a=i.closeOnOutsidePointer??!0,r=i.ariaLabel??"Sidebar navigation",o=i.onExpandedChange,n=w(t,`${e}.expanded`),l=w(!1,`${e}.mobile`),d=jt({idBase:`${e}-dialog`,initialOpen:!1,isModal:!0,closeOnEscape:s,closeOnOutsidePointer:a,closeOnOutsideFocus:!0,initialFocusId:i.initialFocusId});d.actions.setTriggerId(`${e}-toggle`);const u=ae(()=>l()&&d.state.isOpen(),`${e}.isFocusTrapped`),h=ae(()=>l()&&d.state.isOpen(),`${e}.shouldLockScroll`),p=x=>{n()!==x&&(n.set(x),o?.(x))},v={toggle(){l()?d.actions.toggle():p(!n())},expand(){l()||p(!0)},collapse(){l()||p(!1)},openOverlay(){l()&&(d.state.isOpen()||d.actions.open())},closeOverlay(x){l()&&d.state.isOpen()&&d.actions.close(x)},setMobile(x){l()!==x&&(l.set(x),x?d.state.isOpen()&&d.actions.close():(d.state.isOpen()&&d.actions.close(),n.set(t)))},handleKeyDown(x){l()&&d.state.isOpen()&&d.actions.handleKeyDown(x)},handleOutsidePointer(){l()&&d.state.isOpen()&&d.actions.handleOutsidePointer()},handleOutsideFocus(){l()&&d.state.isOpen()&&d.actions.handleOutsideFocus()}},g={getSidebarProps(){const x=l(),m=d.state.isOpen();return x&&m?{id:`${e}-panel`,role:"dialog","aria-modal":"true","aria-label":r,"data-collapsed":"false","data-mobile":"true","data-initial-focus":d.state.initialFocusTargetId()??void 0,onKeyDown:v.handleKeyDown}:{id:`${e}-panel`,role:"navigation","aria-label":r,"data-collapsed":n()?"false":"true","data-mobile":x?"true":"false"}},getToggleProps(){const x=l(),m=n(),I=d.state.isOpen();let $,T;return x?($=I?"true":"false",T=I?"Close sidebar":"Open sidebar"):($=m?"true":"false",T=m?"Collapse sidebar":"Expand sidebar"),{id:`${e}-toggle`,role:"button",tabindex:"0","aria-expanded":$,"aria-controls":`${e}-panel`,"aria-label":T,onClick:v.toggle}},getOverlayProps(){const x=l(),m=d.state.isOpen(),I=!x||!m;return{id:`${e}-overlay`,hidden:I,"data-open":I?"false":"true",onPointerDownOutside:v.handleOutsidePointer,onFocusOutside:v.handleOutsideFocus}},getRailProps(){const x=!n()&&!l();return{id:`${e}-rail`,role:"navigation","aria-label":r,"data-visible":x?"true":"false"}}};return{state:{expanded:n,overlayOpen:d.state.isOpen,mobile:l,isFocusTrapped:u,shouldLockScroll:h,restoreTargetId:d.state.restoreTargetId,initialFocusTargetId:d.state.initialFocusTargetId},actions:v,contracts:g}}const bn=Symbol("Inner update"),Ct=Symbol("Aliased event dispatch"),is="cv-",gn=Q`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
`;let fs;function yn(i){fs=i}class de extends ve{static finalizeStyles(e){const t=[gn,...super.finalizeStyles(e)];return fs&&t.push(fs),t}__frame;__abstractRender;__unmount;[Ct]=!1;constructor(){super(),this.__frame=we()}__initAbstractRender(){this.__abstractRender||(this.__abstractRender=Fr({frame:this.__frame,render:()=>this.render(),rerender:()=>this.requestUpdate(bn,1),name:"ReatomElement"}))}render(){}update(e){this.__initAbstractRender();const{result:t}=this.__abstractRender.render(e),s=Object.prototype.hasOwnProperty.call(this,"render"),a=s?Object.getOwnPropertyDescriptor(this,"render"):void 0;Object.defineProperty(this,"render",{configurable:!0,value:()=>t});try{super.update(e)}finally{s&&a?Object.defineProperty(this,"render",a):delete this.render}}connectedCallback(){super.connectedCallback(),this.__initAbstractRender(),this.__unmount=this.__abstractRender.mount()}disconnectedCallback(){if(super.disconnectedCallback(),this.__unmount){try{this.__unmount()}catch{}this.__unmount=void 0}}dispatchEvent(e){if(this.localName.startsWith(is)&&!this[Ct]&&e instanceof CustomEvent&&!e.type.startsWith(is)){this[Ct]=!0;try{const t=new CustomEvent(`${is}${e.type}`,{detail:e.detail,bubbles:e.bubbles,cancelable:e.cancelable,composed:e.composed});super.dispatchEvent(t),t.defaultPrevented&&e.cancelable&&e.preventDefault()}finally{this[Ct]=!1}}return super.dispatchEvent(e)}}class Da extends ve{static elementName="cv-accordion-item";static get properties(){return{value:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},expanded:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0}}}headerId="";triggerState={id:"",role:"button",tabindex:"-1",ariaExpanded:"false",ariaControls:"",ariaDisabled:"false"};panelState={id:"",role:"region",ariaLabelledBy:"",hidden:!0};constructor(){super(),this.value="",this.disabled=!1,this.expanded=!1,this.active=!1}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
      }

      [part='trigger'] {
        inline-size: 100%;
        min-block-size: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--cv-space-2, 8px);
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        font: inherit;
        text-align: start;
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='trigger-icon'] {
        inline-size: 16px;
        block-size: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--cv-color-text-muted, #9aa6bf);
        transition: transform var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([expanded]) [part='trigger-icon'] {
        transform: rotate(90deg);
      }

      [part='panel'] {
        padding: var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='panel'][hidden] {
        display: none;
      }

      :host([active]) [part='trigger'] {
        border-color: var(--cv-color-primary, #65d7ff);
      }

      :host([disabled]) [part='trigger'] {
        opacity: 0.55;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}applyContracts(e){this.headerId=e.headerId,this.triggerState=e.trigger,this.panelState=e.panel,this.expanded=e.trigger.ariaExpanded==="true",this.active=e.trigger.tabindex==="0",this.requestUpdate()}focusTrigger(){this.renderRoot.querySelector('[part="trigger"]')?.focus()}handleTriggerClick(){this.dispatchEvent(new CustomEvent("cv-accordion-item-trigger-click",{bubbles:!0,composed:!0}))}handleTriggerFocus(){this.dispatchEvent(new CustomEvent("cv-accordion-item-trigger-focus",{bubbles:!0,composed:!0}))}handleTriggerKeyDown(e){this.dispatchEvent(new CustomEvent("cv-accordion-item-trigger-keydown",{detail:{key:e.key},bubbles:!0,composed:!0,cancelable:!0}))||e.preventDefault()}render(){return q`
      <div part="base">
        <h3 id=${this.headerId} part="header">
          <button
            id=${this.triggerState.id}
            role=${this.triggerState.role}
            tabindex=${this.triggerState.tabindex}
            aria-expanded=${this.triggerState.ariaExpanded}
            aria-controls=${this.triggerState.ariaControls}
            aria-disabled=${this.triggerState.ariaDisabled}
            ?disabled=${this.triggerState.ariaDisabled==="true"}
            part="trigger"
            type="button"
            @click=${this.handleTriggerClick}
            @focus=${this.handleTriggerFocus}
            @keydown=${this.handleTriggerKeyDown}
          >
            <slot name="trigger"></slot>
            <span part="trigger-icon" aria-hidden="true">▶</span>
          </button>
        </h3>

        <div
          id=${this.panelState.id}
          role=${this.panelState.role}
          aria-labelledby=${this.panelState.ariaLabelledBy||y}
          ?hidden=${this.panelState.hidden}
          part="panel"
        >
          <slot></slot>
        </div>
      </div>
    `}}const xn=new Set(["ArrowDown","ArrowUp","Home","End","Enter"," ","Spacebar"]),wn=(i,e)=>i.length===e.length&&i.every((t,s)=>t===e[s]);let $n=0;class kn extends de{static elementName="cv-accordion";static get properties(){return{value:{type:String,reflect:!0},expandedValues:{attribute:!1},allowMultiple:{type:Boolean,attribute:"allow-multiple",reflect:!0},allowZeroExpanded:{type:Boolean,attribute:"allow-zero-expanded",reflect:!0},headingLevel:{type:Number,attribute:"heading-level",reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},revealExpanded:{type:Boolean,attribute:"reveal-expanded"}}}idBase=`cv-accordion-${++$n}`;itemRecords=[];itemListeners=new WeakMap;model;constructor(){super(),this.value="",this.expandedValues=[],this.allowMultiple=!1,this.allowZeroExpanded=!0,this.headingLevel=3,this.ariaLabel="",this.revealExpanded=!1,this.model=Fo({idBase:this.idBase,sections:[]})}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-accordion-gap, var(--cv-space-2, 8px));
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.model.actions.setAllowMultiple(this.allowMultiple),this.model.actions.setAllowZeroExpanded(this.allowZeroExpanded),this.model.actions.setHeadingLevel(this.headingLevel),this.model.actions.setAriaLabel(this.ariaLabel||void 0),this.syncFromSlot(!1)}disconnectedCallback(){super.disconnectedCallback(),this.detachItemListeners()}willUpdate(e){super.willUpdate(e);const t=e.has("allowMultiple")||e.has("allowZeroExpanded")||e.has("ariaLabel")||e.has("headingLevel");if(e.has("allowMultiple")&&this.model.actions.setAllowMultiple(this.allowMultiple),e.has("allowZeroExpanded")&&this.model.actions.setAllowZeroExpanded(this.allowZeroExpanded),e.has("ariaLabel")&&this.model.actions.setAriaLabel(this.ariaLabel||void 0),e.has("headingLevel")&&this.model.actions.setHeadingLevel(this.headingLevel),t){this.syncItemElements(),this.syncControlledValuesFromModel();return}if(e.has("value")&&!this.allowMultiple){const s=this.captureSnapshot(),a=this.value.trim();this.model.actions.setExpandedIds(a?[a]:[]),this.applyInteractionResult(s)}if(e.has("expandedValues")&&this.allowMultiple){const s=this.captureSnapshot();this.model.actions.setExpandedIds(this.expandedValues),this.applyInteractionResult(s)}}updated(e){super.updated(e),!e.has("value")&&!e.has("expandedValues")&&this.syncItemElements()}getItemElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===Da.elementName)}ensureItemValue(e,t){const s=e.value?.trim();if(s)return s;const a=`section-${t+1}`;return e.value=a,a}resolveConfiguredExpandedIds(e){if(this.allowMultiple){const a=this.expandedValues.map(r=>r.trim()).filter(r=>r.length>0);return a.length>0?a:e.filter(r=>r.element.expanded).map(r=>r.id)}const t=this.value.trim();if(t)return[t];const s=e.find(a=>a.element.expanded);return s?[s.id]:[]}syncFromSlot(e){const t=this.getItemElements();if(this.detachItemListeners(),this.itemRecords=t.map((s,a)=>({id:this.ensureItemValue(s,a),disabled:s.disabled,element:s})),this.model.actions.setSections(this.itemRecords.map(s=>({id:s.id,disabled:s.disabled}))),!e){const s=this.resolveConfiguredExpandedIds(this.itemRecords);s.length>0&&this.model.actions.setExpandedIds(s)}this.attachItemListeners(),this.syncItemElements(),this.syncControlledValuesFromModel()}detachItemListeners(){for(const e of this.itemRecords){const t=this.itemListeners.get(e.element);t&&(e.element.removeEventListener("cv-accordion-item-trigger-click",t.click),e.element.removeEventListener("cv-accordion-item-trigger-focus",t.focus),e.element.removeEventListener("cv-accordion-item-trigger-keydown",t.keydown),this.itemListeners.delete(e.element))}}attachItemListeners(){for(const e of this.itemRecords){const t=()=>{this.handleItemTriggerClick(e.id)},s=()=>{this.handleItemTriggerFocus(e.id)},a=r=>{this.handleItemTriggerKeyDown(e.id,r)};e.element.addEventListener("cv-accordion-item-trigger-click",t),e.element.addEventListener("cv-accordion-item-trigger-focus",s),e.element.addEventListener("cv-accordion-item-trigger-keydown",a),this.itemListeners.set(e.element,{click:t,focus:s,keydown:a})}}syncItemElements(){for(const e of this.itemRecords){const t=this.model.contracts.getHeaderProps(e.id),s=this.model.contracts.getTriggerProps(e.id),a=this.model.contracts.getPanelProps(e.id);e.element.applyContracts({headerId:t.id,trigger:{id:s.id,role:s.role,tabindex:s.tabindex,ariaExpanded:s["aria-expanded"],ariaControls:s["aria-controls"],ariaDisabled:s["aria-disabled"]},panel:{id:a.id,role:a.role,ariaLabelledBy:a["aria-labelledby"],hidden:a.hidden}})}}syncControlledValuesFromModel(){this.expandedValues=this.model.state.expandedValues(),this.value=this.model.state.value()??""}captureSnapshot(){return{values:this.model.state.expandedValues(),activeId:this.model.state.focusedId()}}focusActiveItem(){const e=this.model.state.focusedId();if(!e)return;this.itemRecords.find(s=>s.id===e)?.element.focusTrigger()}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}revealExpandedItem(e){const t=this.itemRecords.find(s=>s.id===e);t&&t.element.updateComplete.then(()=>{!t.element.isConnected||!t.element.expanded||typeof t.element.scrollIntoView=="function"&&t.element.scrollIntoView({block:"nearest",inline:"nearest"})})}applyInteractionResult(e,t){this.syncItemElements();const s=this.captureSnapshot(),a=!wn(e.values,s.values),r=e.activeId!==s.activeId,o=this.revealExpanded&&t!=null&&!e.values.includes(t)&&s.values.includes(t);if(this.syncControlledValuesFromModel(),o&&this.revealExpandedItem(t),!a&&!r)return;const n={value:this.value||null,values:[...this.expandedValues],activeId:s.activeId};this.dispatchInput(n),a&&this.dispatchChange(n),r&&this.focusActiveItem()}handleItemTriggerClick(e){const t=this.captureSnapshot();this.model.actions.toggle(e),this.applyInteractionResult(t,e)}handleItemTriggerFocus(e){const t=this.captureSnapshot();this.model.actions.setFocused(e),this.applyInteractionResult(t)}handleItemTriggerKeyDown(e,t){const{key:s}=t.detail;xn.has(s)&&t.preventDefault();const a=this.captureSnapshot();this.model.actions.setFocused(e),this.model.actions.handleKeyDown({key:s});const r=s==="Enter"||s===" "||s==="Spacebar";this.applyInteractionResult(a,r?e:void 0)}handleSlotChange(){this.syncFromSlot(!0),this.requestUpdate()}render(){const e=this.model.contracts.getRootProps();return q`
      <section id=${e.id} aria-label=${e["aria-label"]??y} part="base">
        <slot @slotchange=${this.handleSlotChange}></slot>
      </section>
    `}}let In=0;class Sn extends de{static elementName="cv-alert-dialog";static get properties(){return{open:{type:Boolean,reflect:!0},closeOnEscape:{type:Boolean,attribute:"close-on-escape",reflect:!0},closeOnOutsidePointer:{type:Boolean,attribute:"close-on-outside-pointer",reflect:!0},closeOnOutsideFocus:{type:Boolean,attribute:"close-on-outside-focus",reflect:!0},closeOnAction:{type:Boolean,attribute:"close-on-action",reflect:!0},initialFocusId:{type:String,attribute:"initial-focus-id"},ariaLabelledBy:{type:String,attribute:"aria-labelledby"},ariaDescribedBy:{type:String,attribute:"aria-describedby"}}}idBase=`cv-alert-dialog-${++In}`;model;lockScrollApplied=!1;previousBodyOverflow="";constructor(){super(),this.open=!1,this.closeOnEscape=!0,this.closeOnOutsidePointer=!0,this.closeOnOutsideFocus=!0,this.closeOnAction=!0,this.initialFocusId="",this.ariaLabelledBy="",this.ariaDescribedBy="",this.model=this.createModel()}static styles=[Q`
      :host {
        display: inline-block;
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 36px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='overlay'] {
        position: fixed;
        inset: 0;
        z-index: 45;
        display: grid;
        place-items: center;
        background: color-mix(in oklab, black 62%, transparent);
        padding: var(--cv-space-4, 16px);
      }

      [part='overlay'][hidden] {
        display: none;
      }

      [part='content'] {
        inline-size: min(540px, calc(100vw - 32px));
        display: grid;
        gap: var(--cv-space-3, 12px);
        padding: var(--cv-space-4, 16px);
        border-radius: var(--cv-radius-lg, 14px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='content']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='header'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
      }

      [part='title'] {
        margin: 0;
        font-size: 1.05rem;
      }

      [part='description'] {
        margin: 0;
        color: var(--cv-color-text-muted, #9aa6bf);
      }

      [part='footer'] {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cv-space-2, 8px);
        justify-content: flex-end;
      }

      [part='cancel'],
      [part='action'] {
        min-block-size: 34px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='action'] {
        border-color: color-mix(in oklab, var(--cv-color-danger, #ff7a8a) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-danger, #ff7a8a) 22%, var(--cv-color-surface, #141923));
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.syncOutsideFocusListener(),this.syncScrollLock()}disconnectedCallback(){super.disconnectedCallback(),this.syncOutsideFocusListener(!0),this.releaseScrollLock()}willUpdate(e){if(super.willUpdate(e),e.has("closeOnEscape")||e.has("closeOnOutsidePointer")||e.has("closeOnOutsideFocus")||e.has("closeOnAction")||e.has("initialFocusId")||e.has("ariaLabelledBy")||e.has("ariaDescribedBy")){const t=e.has("open")?this.open:this.model.state.isOpen();this.model=this.createModel(t);return}if(e.has("open")&&this.model.state.isOpen()!==this.open){const t=this.captureState();this.open?this.model.actions.open():this.model.actions.close(),this.applyInteractionResult(t)}}updated(e){super.updated(e),this.syncOutsideFocusListener(),this.syncScrollLock(),e.has("open")&&this.open&&this.focusInitialTarget()}createModel(e=this.open){return Vo({idBase:this.idBase,initialOpen:e,closeOnEscape:this.closeOnEscape,closeOnOutsidePointer:this.closeOnOutsidePointer,closeOnOutsideFocus:this.closeOnOutsideFocus,closeOnAction:this.closeOnAction,initialFocusId:this.initialFocusId||void 0,ariaLabelledBy:this.ariaLabelledBy||void 0,ariaDescribedBy:this.ariaDescribedBy||void 0})}captureState(){return{open:this.model.state.isOpen(),restoreTargetId:this.model.state.restoreTargetId()}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}applyInteractionResult(e){const t=this.model.state.isOpen();if(this.open=t,e.open!==t){const a={open:t};this.dispatchInput(a),this.dispatchChange(a)}const s=this.model.state.restoreTargetId();s&&e.restoreTargetId!==s&&this.shadowRoot?.querySelector(`[id="${s}"]`)?.focus()}syncOutsideFocusListener(e=!1){!e&&this.open?document.addEventListener("focusin",this.handleDocumentFocusIn):document.removeEventListener("focusin",this.handleDocumentFocusIn)}syncScrollLock(){if(!this.open){this.releaseScrollLock();return}this.lockScrollApplied||(this.previousBodyOverflow=document.body.style.overflow,document.body.style.overflow="hidden",this.lockScrollApplied=!0)}releaseScrollLock(){this.lockScrollApplied&&(document.body.style.overflow=this.previousBodyOverflow,this.lockScrollApplied=!1)}focusInitialTarget(){const t=this.model.contracts.getDialogProps()["data-initial-focus"];if(t){const a=this.querySelector(`#${t}`)??this.shadowRoot?.querySelector(`#${t}`);if(a){a.focus();return}}this.shadowRoot?.querySelector('[part="content"]')?.focus()}handleDocumentFocusIn=e=>{if(!this.open||e.composedPath().includes(this))return;const t=this.captureState();this.model.contracts.getOverlayProps().onFocusOutside(),this.applyInteractionResult(t)};handleTriggerClick(){const e=this.captureState();this.open?this.model.actions.close():this.model.actions.open(),this.applyInteractionResult(e)}handleTriggerKeyDown(e){(e.key==="Enter"||e.key===" "||e.key==="Spacebar")&&(e.preventDefault(),this.handleTriggerClick())}handleOverlayPointerDown(e){if(e.target!==e.currentTarget)return;const t=this.captureState();this.model.contracts.getOverlayProps().onPointerDownOutside(),this.applyInteractionResult(t)}handleContentKeyDown(e){e.key==="Escape"&&e.preventDefault();const t=this.captureState();this.model.contracts.getDialogProps().onKeyDown({key:e.key}),this.applyInteractionResult(t)}handleCancelClick(){const e=this.captureState();this.model.contracts.getCancelButtonProps().onClick(),this.applyInteractionResult(e),this.dispatchEvent(new CustomEvent("cv-cancel",{bubbles:!0,composed:!0}))}handleActionClick(){const e=this.captureState();this.model.contracts.getActionButtonProps().onClick(),this.applyInteractionResult(e),this.dispatchEvent(new CustomEvent("cv-action",{bubbles:!0,composed:!0}))}render(){const e=this.model.contracts.getDialogProps(),t=this.model.contracts.getOverlayProps(),s=this.model.contracts.getTitleProps(),a=this.model.contracts.getDescriptionProps(),r=this.model.contracts.getCancelButtonProps(),o=this.model.contracts.getActionButtonProps();return q`
      <button
        part="trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded=${this.open?"true":"false"}
        @click=${this.handleTriggerClick}
        @keydown=${this.handleTriggerKeyDown}
      >
        <slot name="trigger">Open alert dialog</slot>
      </button>

      <div
        id=${t.id}
        ?hidden=${t.hidden}
        data-open=${t["data-open"]}
        part="overlay"
        @mousedown=${this.handleOverlayPointerDown}
      >
        <section
          id=${e.id}
          role=${e.role}
          tabindex=${e.tabindex}
          aria-modal=${e["aria-modal"]}
          aria-labelledby=${e["aria-labelledby"]}
          aria-describedby=${e["aria-describedby"]}
          data-initial-focus=${e["data-initial-focus"]??y}
          part="content"
          @keydown=${this.handleContentKeyDown}
        >
          <header part="header">
            <h2 id=${s.id} part="title">
              <slot name="title">Confirm action</slot>
            </h2>
            <p id=${a.id} part="description">
              <slot name="description">This action cannot be undone.</slot>
            </p>
          </header>

          <footer part="footer">
            <button
              id=${r.id}
              role=${r.role}
              tabindex=${r.tabindex}
              type="button"
              part="cancel"
              @click=${this.handleCancelClick}
            >
              <slot name="cancel">Cancel</slot>
            </button>

            <button
              id=${o.id}
              role=${o.role}
              tabindex=${o.tabindex}
              type="button"
              part="action"
              @click=${this.handleActionClick}
            >
              <slot name="action">Confirm</slot>
            </button>
          </footer>
        </section>
      </div>
    `}}let Cn=0;class En extends de{static elementName="cv-alert";static get properties(){return{durationMs:{type:Number,attribute:"duration-ms",reflect:!0},ariaLive:{type:String,attribute:"aria-live",reflect:!0},atomic:{type:Boolean,attribute:"aria-atomic",reflect:!0}}}idBase=`cv-alert-${++Cn}`;model;currentVisible=!1;currentMessage="";constructor(){super(),this.durationMs=0,this.ariaLive="assertive",this.atomic=!0,this.model=this.createModel()}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-alert-gap, var(--cv-space-2, 8px));
        padding:
          var(--cv-alert-padding-block, var(--cv-space-2, 8px))
          var(--cv-alert-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-alert-radius, var(--cv-radius-sm, 6px));
        border: 1px solid var(--cv-alert-border-color, var(--cv-color-border, #2a3245));
        background: var(--cv-alert-background, var(--cv-color-surface-elevated, #1d2432));
        color: var(--cv-alert-color, var(--cv-color-text, #e8ecf6));
        transition:
          opacity
          var(--cv-alert-transition-duration, var(--cv-duration-fast, 120ms))
          var(--cv-alert-transition-easing, var(--cv-easing-standard, ease)),
          transform
          var(--cv-alert-transition-duration, var(--cv-duration-fast, 120ms))
          var(--cv-alert-transition-easing, var(--cv-easing-standard, ease));
      }

      :host(:not([visible])) [part='base'] {
        opacity: 0;
        transform: translateY(var(--cv-alert-hidden-translate-y, -2px));
        pointer-events: none;
      }

      [part='message']:empty {
        display: none;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.syncFromModel(!1)}willUpdate(e){if(super.willUpdate(e),e.has("durationMs")||e.has("ariaLive")||e.has("atomic")){const t=this.captureState();this.model=this.createModel(t.message,t.visible),this.syncFromModel(!1)}}updated(e){super.updated(e),!(e.has("durationMs")||e.has("ariaLive")||e.has("atomic"))&&this.syncFromModel(!0)}show(e){this.model.actions.show(e),this.syncFromModel(!0)}hide(){this.model.actions.hide(),this.syncFromModel(!0)}createModel(e="",t=!1){return ro({idBase:this.idBase,ariaLive:this.ariaLive,ariaAtomic:this.atomic,durationMs:this.durationMs>0?this.durationMs:void 0,initialMessage:e,initialVisible:t})}captureState(){return{visible:this.model.state.isVisible(),message:this.model.state.message()}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}syncFromModel(e){const t=this.captureState(),s=this.currentVisible!==t.visible,a=this.currentMessage!==t.message;this.currentVisible=t.visible,this.currentMessage=t.message,this.toggleAttribute("visible",t.visible),!(!e||!s&&!a)&&(this.dispatchInput(t),s&&this.dispatchChange(t))}render(){const e=this.model.contracts.getAlertProps(),t=this.model.state.isVisible(),s=this.model.state.message();return q`
      <div
        id=${e.id}
        role=${e.role}
        aria-live=${e["aria-live"]}
        aria-atomic=${e["aria-atomic"]}
        data-visible=${t?"true":"false"}
        part="base"
      >
        <div part="message">${s}</div>
        <slot></slot>
      </div>
    `}}class La extends ve{static elementName="cv-breadcrumb-item";static get properties(){return{value:{type:String,reflect:!0},href:{type:String,reflect:!0},current:{type:Boolean,reflect:!0},showSeparator:{type:Boolean,attribute:"show-separator",reflect:!0},linkId:{attribute:!1}}}constructor(){super(),this.value="",this.href="",this.current=!1,this.showSeparator=!0,this.linkId=""}static styles=[Q`
      :host {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-space-2, 8px);
      }

      [part='link'] {
        color: var(--cv-color-text, #e8ecf6);
        text-decoration: none;
      }

      :host([current]) [part='link'] {
        font-weight: 600;
      }

      [part='separator'] {
        color: color-mix(in oklab, var(--cv-color-text, #e8ecf6) 60%, transparent);
      }

      [part='separator'][hidden] {
        display: none;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`
      <span part="prefix"><slot name="prefix"></slot></span>
      <a id=${this.linkId||y} role="link" href=${this.href} aria-current=${this.current?"page":y} part="link">
        <slot></slot>
      </a>
      <span part="suffix"><slot name="suffix"></slot></span>
      <span aria-hidden="true" ?hidden=${!this.showSeparator} part="separator">
        <slot name="separator">/</slot>
      </span>
    `}}let An=0;class Dn extends de{static elementName="cv-breadcrumb";static get properties(){return{value:{type:String,reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},ariaLabelledBy:{type:String,attribute:"aria-labelledby"}}}idBase=`cv-breadcrumb-${++An}`;itemRecords=[];model;constructor(){super(),this.value="",this.ariaLabel="",this.ariaLabelledBy="",this.model=vi({idBase:this.idBase,items:[]})}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: block;
      }

      [part='list'] {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--cv-space-2, 8px);
        margin: 0;
        padding: 0;
        list-style: none;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.rebuildModelFromSlot(!1,!1,this.value.trim()||null)}willUpdate(e){if(super.willUpdate(e),e.has("ariaLabel")||e.has("ariaLabelledBy")){this.rebuildModelFromSlot(!0,!1);return}if(e.has("value")){const t=this.value.trim();this.value!==t&&(this.value=t),this.rebuildModelFromSlot(!0,!1,t||null)}}updated(e){super.updated(e),e.has("value")||this.syncItemElements()}get items(){return this.itemRecords.map(e=>e.id)}getItemElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===La.elementName)}ensureItemValue(e,t){const s=e.value?.trim();if(s)return s;const a=`item-${t+1}`;return e.value=a,a}ensureItemHref(e){const t=e.href?.trim();return t||(e.href="#","#")}rebuildModelFromSlot(e,t=!0,s=null){const a=this.getItemElements(),r=e?this.model.state.currentId():null;this.itemRecords=a.map((n,l)=>({id:this.ensureItemValue(n,l),label:n.textContent?.trim()||n.value||`item-${l+1}`,href:this.ensureItemHref(n),current:n.current,element:n}));const o=s??r;this.model=vi({idBase:this.idBase,ariaLabel:this.ariaLabel||void 0,ariaLabelledBy:this.ariaLabelledBy||void 0,items:this.itemRecords.map(n=>({id:n.id,label:n.label,href:n.href,isCurrent:o?n.id===o:n.current}))}),this.syncItemElements(),this.value=this.model.state.currentId()??"",t&&this.requestUpdate()}syncItemElements(){for(const[e,t]of this.itemRecords.entries()){const s=this.model.contracts.getItemProps(t.id),a=this.model.contracts.getLinkProps(t.id),r=this.model.contracts.getSeparatorProps(t.id);t.element.id=s.id,t.element.linkId=a.id,t.element.href=a.href,t.element.current=a["aria-current"]==="page",t.element.showSeparator=e<this.itemRecords.length-1&&r["aria-hidden"]==="true",t.element.setAttribute("data-current",s["data-current"])}}handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}render(){const e=this.model.contracts.getRootProps(),t=this.model.contracts.getListProps();return q`
      <nav
        role=${e.role}
        aria-label=${e["aria-label"]??y}
        aria-labelledby=${e["aria-labelledby"]??y}
        part="base"
      >
        <ol role=${t.role??y} part="list">
          <slot @slotchange=${this.handleSlotChange}></slot>
        </ol>
      </nav>
    `}}class Ln extends de{static elementName="cv-badge";static get properties(){return{variant:{type:String,reflect:!0},size:{type:String,reflect:!0},dot:{type:Boolean,reflect:!0},pulse:{type:Boolean,reflect:!0},pill:{type:Boolean,reflect:!0},dynamic:{type:Boolean,reflect:!0},decorative:{type:Boolean,reflect:!0},_ariaLabel:{type:String,attribute:"aria-label",reflect:!1}}}model;constructor(){super(),this.variant="neutral",this.size="medium",this.dot=!1,this.pulse=!1,this.pill=!1,this.dynamic=!1,this.decorative=!1,this._ariaLabel=null,this.model=this.createModel()}static styles=[Q`
      :host {
        display: inline-block;
        --cv-badge-height: 24px;
        --cv-badge-padding-inline: var(--cv-space-2, 8px);
        --cv-badge-border-radius: var(--cv-radius-sm, 6px);
        --cv-badge-gap: var(--cv-space-1, 4px);
        --cv-badge-font-size: 12px;
        --cv-badge-dot-size: 8px;
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--cv-badge-gap);
        padding-inline: var(--cv-badge-padding-inline);
        height: var(--cv-badge-height);
        font-size: var(--cv-badge-font-size);
        border-radius: var(--cv-badge-border-radius);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        user-select: none;
        white-space: nowrap;
        line-height: 1;
        box-sizing: border-box;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='label'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--cv-badge-gap);
      }

      [part='prefix'],
      [part='suffix'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      /* --- variant: neutral (default) --- */
      :host([variant='neutral']) [part='base'] {
        border-color: var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      /* --- variant: primary --- */
      :host([variant='primary']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, var(--cv-color-surface, #141923));
      }

      /* --- variant: success --- */
      :host([variant='success']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-success, #5beba0) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-success, #5beba0) 22%, var(--cv-color-surface, #141923));
      }

      /* --- variant: warning --- */
      :host([variant='warning']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-warning, #ffc857) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-warning, #ffc857) 22%, var(--cv-color-surface, #141923));
      }

      /* --- variant: danger --- */
      :host([variant='danger']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 22%, var(--cv-color-surface, #141923));
      }

      /* --- pill modifier --- */
      :host([pill]) {
        --cv-badge-border-radius: 999px;
      }

      /* --- dot mode --- */
      :host([dot]) [part='base'] {
        padding: 0;
        width: var(--cv-badge-dot-size);
        height: var(--cv-badge-dot-size);
        min-width: var(--cv-badge-dot-size);
        min-height: var(--cv-badge-dot-size);
        border-radius: 999px;
      }

      :host([dot]) [part='label'],
      :host([dot]) [part='prefix'],
      :host([dot]) [part='suffix'] {
        display: none;
      }

      /* --- dot variant colors --- */
      :host([dot][variant='neutral']) [part='base'] {
        background: var(--cv-color-border, #2a3245);
        border-color: var(--cv-color-border, #2a3245);
      }

      :host([dot][variant='primary']) [part='base'] {
        background: var(--cv-color-primary, #65d7ff);
        border-color: var(--cv-color-primary, #65d7ff);
      }

      :host([dot][variant='success']) [part='base'] {
        background: var(--cv-color-success, #5beba0);
        border-color: var(--cv-color-success, #5beba0);
      }

      :host([dot][variant='warning']) [part='base'] {
        background: var(--cv-color-warning, #ffc857);
        border-color: var(--cv-color-warning, #ffc857);
      }

      :host([dot][variant='danger']) [part='base'] {
        background: var(--cv-color-danger, #ff7d86);
        border-color: var(--cv-color-danger, #ff7d86);
      }

      /* --- pulse animation --- */
      :host([pulse]) [part='base'] {
        animation: cv-badge-pulse 1.5s ease-in-out infinite;
      }

      @keyframes cv-badge-pulse {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.7;
          transform: scale(1.05);
        }
      }

      /* --- sizes --- */
      :host([size='small']) {
        --cv-badge-height: 20px;
        --cv-badge-padding-inline: var(--cv-space-1, 4px);
        --cv-badge-font-size: 11px;
        --cv-badge-dot-size: 6px;
      }

      :host([size='large']) {
        --cv-badge-height: 28px;
        --cv-badge-padding-inline: var(--cv-space-3, 12px);
        --cv-badge-font-size: 14px;
        --cv-badge-dot-size: 10px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}willUpdate(e){super.willUpdate(e),e.has("variant")&&this.model.actions.setVariant(this.variant),e.has("size")&&this.model.actions.setSize(this.size),e.has("dot")&&this.model.actions.setDot(this.dot),e.has("pulse")&&this.model.actions.setPulse(this.pulse),e.has("pill")&&this.model.actions.setPill(this.pill),e.has("dynamic")&&this.model.actions.setDynamic(this.dynamic),e.has("decorative")&&this.model.actions.setDecorative(this.decorative)}createModel(){return on({variant:this.variant,size:this.size,dot:this.dot,pulse:this.pulse,pill:this.pill,isDynamic:this.dynamic,isDecorative:this.decorative})}render(){const e=this.model.contracts.getBadgeProps(),t=this.dot,s=this._ariaLabel??e["aria-label"];return q`
      <div
        part="base"
        role=${e.role??y}
        aria-live=${e["aria-live"]??y}
        aria-atomic=${e["aria-atomic"]??y}
        aria-hidden=${e["aria-hidden"]??y}
        aria-label=${s??y}
      >
        <span part="prefix" ?hidden=${t}><slot name="prefix"></slot></span>
        <span part="label" ?hidden=${t}><slot></slot></span>
        <span part="suffix" ?hidden=${t}><slot name="suffix"></slot></span>
      </div>
    `}}const On=i=>{class e extends i{static formAssociated=!0;internals;_formDisabled=!1;constructor(...s){super(...s),this.internals=this.attachInternals()}get formDisabled(){return this._formDisabled}formDisabledCallback(s){this._formDisabled=s,this.onFormDisabledChanged(s),this.syncFormAssociatedState(),this.requestUpdate()}formResetCallback(){this.onFormReset(),this.syncFormAssociatedState(),this.requestUpdate()}formStateRestoreCallback(s){this.onFormStateRestore(s),this.syncFormAssociatedState(),this.requestUpdate()}get form(){return this.internals.form}get validity(){return this.internals.validity}get validationMessage(){return this.internals.validationMessage}get willValidate(){return!this.isFormAssociatedDisabled()}checkValidity(){return this.syncFormAssociatedState(),this.internals.checkValidity()}reportValidity(){return this.syncFormAssociatedState(),this.internals.reportValidity()}syncFormAssociatedState(){if(this.isFormAssociatedDisabled()){this.internals.setFormValue(null),this.internals.setValidity({});return}this.internals.setFormValue(this.getFormAssociatedValue());const s=this.getFormAssociatedValidity(),a=s.flags??{};if(Object.keys(a).length===0){this.internals.setValidity({});return}this.internals.setValidity(a,s.message,s.anchor)}onFormDisabledChanged(s){}onFormReset(){}onFormStateRestore(s){}getFormAssociatedValidity(){return{flags:{}}}}return e};class Le extends On(de){}let Mn=0;class Rn extends Le{static elementName="cv-button";static get properties(){return{disabled:{type:Boolean,reflect:!0},toggle:{type:Boolean,reflect:!0},pressed:{type:Boolean,reflect:!0},loading:{type:Boolean,reflect:!0},variant:{type:String,reflect:!0},outline:{type:Boolean,reflect:!0},pill:{type:Boolean,reflect:!0},size:{type:String,reflect:!0},type:{type:String,reflect:!0}}}model;suppressKeyboardClick=!1;constructor(){super(),this.disabled=!1,this.toggle=!1,this.pressed=!1,this.loading=!1,this.variant="default",this.outline=!1,this.pill=!1,this.size="medium",this.type="button",this.model=this.createModel()}static styles=[Q`
      :host {
        display: block;
        width: 100%;
        cursor: pointer;
        user-select: none;
        --cv-button-min-height: 36px;
        --cv-button-padding-inline: var(--cv-space-3, 12px);
        --cv-button-padding-block: var(--cv-space-2, 8px);
        --cv-button-border-radius: var(--cv-radius-sm, 6px);
        --cv-button-gap: var(--cv-space-2, 8px);
        --cv-button-font-size: var(--cv-button-font-size-medium, var(--cv-font-size-base, 14px));
        --cv-button-font-weight: var(--cv-button-font-weight-medium, inherit);
      }

      [part='base'] {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: center;
        appearance: none;
        font: inherit;
        gap: var(--cv-button-gap);
        padding: var(--cv-button-padding-block) var(--cv-button-padding-inline);
        min-height: var(--cv-button-min-height);
        font-size: var(--cv-button-font-size);
        font-weight: var(--cv-button-font-weight);
        border-radius: var(--cv-button-border-radius);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
        user-select: none;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='label'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--cv-button-gap);
      }

      [part='prefix'],
      [part='suffix'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      [part='prefix'][hidden],
      [part='suffix'][hidden] {
        display: none;
      }

      /* --- variant: primary --- */
      :host([variant='primary']) [part='base'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 52%,
          var(--cv-color-border, #2a3245)
        );
        background: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 22%,
          var(--cv-color-surface, #141923)
        );
      }

      /* --- variant: danger --- */
      :host([variant='danger']) [part='base'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-danger, #ff7d86) 52%,
          var(--cv-color-border, #2a3245)
        );
        background: color-mix(
          in oklab,
          var(--cv-color-danger, #ff7d86) 22%,
          var(--cv-color-surface, #141923)
        );
      }

      /* --- variant: ghost --- */
      :host([variant='ghost']) [part='base'] {
        background: transparent;
        border-color: transparent;
      }

      /* --- outline modifier --- */
      :host([outline]) [part='base'] {
        background: transparent;
        border-color: var(--cv-color-border, #2a3245);
      }

      :host([outline][variant='primary']) [part='base'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 52%,
          var(--cv-color-border, #2a3245)
        );
      }

      :host([outline][variant='danger']) [part='base'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-danger, #ff7d86) 52%,
          var(--cv-color-border, #2a3245)
        );
      }

      /* --- pill modifier --- */
      :host([pill]) {
        --cv-button-border-radius: 999px;
      }

      /* --- hover --- */
      [part='base']:hover {
        border-color: var(--cv-color-primary, #65d7ff);
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      /* --- pressed states --- */
      :host([pressed]) [part='base'] {
        background: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 30%,
          var(--cv-color-surface, #141923)
        );
      }

      :host([pressed][outline]) [part='base'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 16%, transparent);
      }

      :host([pressed][variant='ghost']) [part='base'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 14%, transparent);
      }

      :host([pressed][variant='danger']) [part='base'] {
        background: color-mix(
          in oklab,
          var(--cv-color-danger, #ff7d86) 32%,
          var(--cv-color-surface, #141923)
        );
      }

      :host([pressed][outline][variant='danger']) [part='base'] {
        background: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 16%, transparent);
      }

      :host([pressed][variant='primary']) [part='base'] {
        background: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 38%,
          var(--cv-color-surface, #141923)
        );
      }

      :host([pressed][outline][variant='primary']) [part='base'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 20%, transparent);
      }

      /* --- sizes --- */
      :host([size='small']) {
        --cv-button-min-height: 30px;
        --cv-button-padding-inline: var(--cv-space-2, 8px);
        --cv-button-padding-block: var(--cv-space-1, 4px);
        --cv-button-font-size: var(
          --cv-button-font-size-small,
          var(--cv-font-size-sm, 13px)
        );
      }

      :host([size='large']) {
        --cv-button-min-height: 42px;
        --cv-button-padding-inline: var(--cv-space-4, 16px);
        --cv-button-padding-block: var(--cv-space-2, 8px);
        --cv-button-font-size: var(--cv-button-font-size-large, var(--cv-font-size-md, 16px));
      }

      /* --- spinner --- */
      [part='spinner'] {
        inline-size: 14px;
        block-size: 14px;
        border-radius: 999px;
        border: 2px solid color-mix(in oklab, var(--cv-color-primary, #65d7ff) 32%, transparent);
        border-top-color: var(--cv-color-primary, #65d7ff);
        animation: cv-button-spin 800ms linear infinite;
      }

      :host([loading]) [part='base'] {
        cursor: progress;
      }

      :host([loading]) {
        cursor: progress;
      }

      :host([loading]) [part='label'] {
        opacity: 0.72;
      }

      /* --- disabled --- */
      :host([disabled]) {
        cursor: not-allowed;
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
        cursor: not-allowed;
      }

      @keyframes cv-button-spin {
        to {
          transform: rotate(360deg);
        }
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}willUpdate(e){if(super.willUpdate(e),e.has("toggle")){this.model=this.createModel();return}e.has("disabled")&&this.model.actions.setDisabled(this.disabled),e.has("loading")&&this.model.actions.setLoading(this.loading),this.toggle&&e.has("pressed")&&this.model.actions.setPressed(this.pressed)}createModel(){const e=this.toggle?this.pressed:void 0;return vo({idBase:`cv-button-${++Mn}`,isDisabled:this.disabled,isLoading:this.loading,isPressed:e,onPress:this.handlePress.bind(this)})}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}handlePress(){const e=this.model.state.isPressed(),t=this.pressed;this.toggle&&(this.pressed=e,this.dispatchInput({pressed:e,toggle:this.toggle}),t!==e&&this.dispatchChange({pressed:e})),this.triggerFormAction()}getButtonType(){return this.type==="submit"||this.type==="reset"?this.type:"button"}isFormAssociatedDisabled(){return this.disabled||this.loading||this.formDisabled}getFormAssociatedValue(){return null}triggerFormAction(){const e=this.getButtonType();if(e==="button"||this.isFormAssociatedDisabled())return;const t=this.form;if(t){if(e==="reset"){t.reset();return}t.requestSubmit()}}handleClick(e){if(this.suppressKeyboardClick&&e.detail===0){this.suppressKeyboardClick=!1,e.preventDefault();return}this.suppressKeyboardClick=!1,this.model.contracts.getButtonProps().onClick()}handleKeyDown(e){e.key==="Enter"&&(this.suppressKeyboardClick=!0),this.model.contracts.getButtonProps().onKeyDown(e)}handleKeyUp(e){(e.key===" "||e.key==="Spacebar")&&(this.suppressKeyboardClick=!0),this.model.contracts.getButtonProps().onKeyUp(e)}handleContentSlotChange(){this.requestUpdate()}hasSlotContent(e){return Array.from(this.children??[]).some(t=>t.getAttribute("slot")===e)}render(){const e=this.model.contracts.getButtonProps(),t=this.disabled||this.loading,s=this.hasSlotContent("prefix"),a=this.hasSlotContent("suffix");return q`
      <button
        id=${e.id}
        type="button"
        role=${e.role}
        tabindex=${e.tabindex}
        ?disabled=${t}
        aria-disabled=${e["aria-disabled"]??y}
        aria-busy=${e["aria-busy"]??y}
        aria-pressed=${e["aria-pressed"]??y}
        part="base"
        @click=${this.handleClick}
        @keydown=${this.handleKeyDown}
        @keyup=${this.handleKeyUp}
      >
        ${this.loading?q`<span part="spinner" aria-hidden="true"></span>`:y}
        <span part="prefix" ?hidden=${!s}
          ><slot name="prefix" @slotchange=${this.handleContentSlotChange}></slot
        ></span>
        <span part="label"><slot></slot></span>
        <span part="suffix" ?hidden=${!a}
          ><slot name="suffix" @slotchange=${this.handleContentSlotChange}></slot
        ></span>
      </button>
    `}}let Tn=0;class od extends de{static elementName="cv-callout";static get properties(){return{variant:{type:String,reflect:!0},closable:{type:Boolean,reflect:!0},open:{type:Boolean,reflect:!0}}}idBase=`cv-callout-${++Tn}`;model;constructor(){super(),this.variant="info",this.closable=!1,this.open=!0,this.model=vn({idBase:this.idBase,variant:this.variant,closable:this.closable,open:this.open})}static styles=[Q`
      :host {
        display: block;
      }

      :host(:not([open])) {
        display: none;
      }

      [part='base'] {
        display: flex;
        align-items: flex-start;
        gap: var(--cv-callout-gap, var(--cv-space-2, 8px));
        padding:
          var(--cv-callout-padding-block, var(--cv-space-3, 12px))
          var(--cv-callout-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-callout-border-radius, var(--cv-radius-sm, 6px));
        border: 1px solid var(--cv-callout-border-color, var(--cv-color-border, #2a3245));
        background: var(--cv-callout-background, var(--cv-color-surface-elevated, #1d2432));
        color: var(--cv-callout-color, var(--cv-color-text, #e8ecf6));
        font-size: var(--cv-callout-font-size, var(--cv-font-size-base, 14px));
        transition:
          opacity
          var(--cv-callout-transition-duration, var(--cv-duration-fast, 120ms))
          var(--cv-callout-transition-easing, var(--cv-easing-standard, ease)),
          transform
          var(--cv-callout-transition-duration, var(--cv-duration-fast, 120ms))
          var(--cv-callout-transition-easing, var(--cv-easing-standard, ease));
      }

      [part='icon'] {
        display: inline-flex;
        align-items: center;
        color: var(--cv-callout-icon-color, currentColor);
      }

      [part='message'] {
        flex: 1;
      }

      [part='close-button'] {
        appearance: none;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        color: inherit;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      /* --- variant: info (default) --- */
      :host([variant='info']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-info, #65d7ff) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-info, #65d7ff) 12%, var(--cv-color-surface-elevated, #1d2432));
      }

      :host([variant='info']) [part='icon'] {
        color: var(--cv-color-info, #65d7ff);
      }

      /* --- variant: success --- */
      :host([variant='success']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-success, #5beba0) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-success, #5beba0) 12%, var(--cv-color-surface-elevated, #1d2432));
      }

      :host([variant='success']) [part='icon'] {
        color: var(--cv-color-success, #5beba0);
      }

      /* --- variant: warning --- */
      :host([variant='warning']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-warning, #ffc857) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-warning, #ffc857) 12%, var(--cv-color-surface-elevated, #1d2432));
      }

      :host([variant='warning']) [part='icon'] {
        color: var(--cv-color-warning, #ffc857);
      }

      /* --- variant: danger --- */
      :host([variant='danger']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 12%, var(--cv-color-surface-elevated, #1d2432));
      }

      :host([variant='danger']) [part='icon'] {
        color: var(--cv-color-danger, #ff7d86);
      }

      /* --- variant: neutral --- */
      :host([variant='neutral']) [part='base'] {
        border-color: var(--cv-callout-border-color, var(--cv-color-border, #2a3245));
        background: var(--cv-callout-background, var(--cv-color-surface-elevated, #1d2432));
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}willUpdate(e){super.willUpdate(e),e.has("variant")&&this.model.actions.setVariant(this.variant),e.has("closable")&&this.model.actions.setClosable(this.closable),e.has("open")&&(this.open?this.model.actions.show():this.model.state.closable()&&this.model.actions.close())}handleClose(){this.model.actions.close(),!this.model.state.open()&&this.open&&(this.open=!1,this.dispatchEvent(new CustomEvent("cv-close",{bubbles:!0,composed:!0})))}render(){const e=this.model.contracts.getCalloutProps(),t=this.model.state.closable();return q`
      <div
        id=${e.id}
        role=${e.role}
        data-variant=${e["data-variant"]}
        part="base"
      >
        <span part="icon"><slot name="icon"></slot></span>
        <span part="message"><slot></slot></span>
        ${t?this.renderCloseButton():y}
      </div>
    `}renderCloseButton(){const e=this.model.contracts.getCloseButtonProps();return q`
      <button
        id=${e.id}
        part="close-button"
        role=${e.role}
        tabindex=${e.tabindex}
        aria-label=${e["aria-label"]}
        @click=${()=>this.handleClose()}
      >
        &#x2715;
      </button>
    `}}let Bn=0;class Pn extends de{static elementName="cv-card";static get properties(){return{variant:{type:String,reflect:!0},expandable:{type:Boolean,reflect:!0},expanded:{type:Boolean,reflect:!0},disabled:{type:Boolean,reflect:!0}}}idBase=`cv-card-${++Bn}`;model;suppressEvents=!1;constructor(){super(),this.variant="elevated",this.expandable=!1,this.expanded=!1,this.disabled=!1,this.model=this.createModel()}static styles=[Q`
      :host {
        display: block;
        --cv-card-padding: var(--cv-space-4, 16px);
        --cv-card-border-radius: var(--cv-radius-md, 8px);
        --cv-card-border-color: var(--cv-color-border, #2a3245);
        --cv-card-background: var(--cv-color-surface, #141923);
        --cv-card-shadow: 0 1px 3px rgba(0, 0, 0, 0.24);
        --cv-card-gap: var(--cv-space-0, 0px);
        --cv-card-indicator-size: var(--cv-space-4, 16px);
        --cv-card-indicator-transition: var(--cv-duration-fast, 120ms)
          var(--cv-easing-standard, ease);
      }

      [part='base'] {
        display: flex;
        flex-direction: column;
        gap: var(--cv-card-gap);
        border-radius: var(--cv-card-border-radius);
        background: var(--cv-card-background);
        color: var(--cv-color-text, #e8ecf6);
        overflow: hidden;
      }

      [part='image'] {
        display: block;
      }

      [part='image'] ::slotted(*) {
        display: block;
        width: 100%;
      }

      [part='header'] {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--cv-card-padding);
      }

      [part='body'] {
        padding: 0 var(--cv-card-padding) var(--cv-card-padding);
      }

      [part='body'][hidden] {
        display: none;
      }

      [part='footer'] {
        padding: 0 var(--cv-card-padding) var(--cv-card-padding);
      }

      [part='indicator'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: var(--cv-card-indicator-size);
        block-size: var(--cv-card-indicator-size);
        transition: transform var(--cv-card-indicator-transition);
      }

      :host([expanded]) [part='indicator'] {
        transform: rotate(90deg);
      }

      /* --- variant: elevated (default) --- */
      :host([variant='elevated']) [part='base'] {
        box-shadow: var(--cv-card-shadow);
      }

      /* --- variant: outlined --- */
      :host([variant='outlined']) [part='base'] {
        border: 1px solid var(--cv-card-border-color);
        box-shadow: none;
      }

      /* --- variant: filled --- */
      :host([variant='filled']) [part='base'] {
        box-shadow: none;
      }

      /* --- expandable header as trigger --- */
      :host([expandable]) [part='header'] {
        cursor: pointer;
        user-select: none;
      }

      :host([expandable]) [part='header']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: -2px;
      }

      /* --- disabled --- */
      :host([disabled]) {
        opacity: 0.55;
      }

      :host([disabled]) [part='header'] {
        cursor: not-allowed;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}willUpdate(e){if(super.willUpdate(e),e.has("expandable")){this.model=this.createModel();return}if(e.has("disabled")&&this.model.actions.setDisabled(this.disabled),e.has("expanded")&&this.model.state.isExpanded()!==this.expanded){this.suppressEvents=!0;const t=this.model.state.isDisabled();if(t&&this.model.actions.setDisabled(!1),!this.model.state.isExpandable()){this.suppressEvents=!1;return}this.expanded?this.model.actions.expand():this.model.actions.collapse(),t&&this.model.actions.setDisabled(!0),this.expanded=this.model.state.isExpanded(),this.suppressEvents=!1}}createModel(){return ln({idBase:this.idBase,isExpandable:this.expandable,isExpanded:this.expanded,isDisabled:this.disabled,onExpandedChange:this.handleExpandedChange.bind(this)})}handleExpandedChange(e){if(this.expanded=e,this.suppressEvents)return;const t={expanded:e};this.dispatchEvent(new CustomEvent("cv-input",{detail:t,bubbles:!0,composed:!0})),this.dispatchEvent(new CustomEvent("cv-change",{detail:t,bubbles:!0,composed:!0}))}handleHeaderClick(){const e=this.model.contracts.getTriggerProps();"onClick"in e&&typeof e.onClick=="function"&&e.onClick()}handleHeaderKeyDown(e){const t=this.model.contracts.getTriggerProps();"onKeyDown"in t&&typeof t.onKeyDown=="function"&&t.onKeyDown(e)}render(){this.model.contracts.getCardProps();const e=this.model.contracts.getTriggerProps(),t=this.model.contracts.getContentProps(),s=this.model.state.isExpandable(),a=s?e.id:void 0,r=s?e.role:void 0,o=s?e.tabindex:void 0,n=s?e["aria-expanded"]:void 0,l=s?e["aria-controls"]:void 0,d=s?e["aria-disabled"]:void 0,u=s?t.id:void 0,h=s?t.role:void 0,p=s?t["aria-labelledby"]:void 0,v=s?t.hidden:!1;return q`
      <div part="base" class="flex flex-col overflow-hidden">
        <div part="image">
          <slot name="image"></slot>
        </div>

        <div
          id=${a??y}
          role=${r??y}
          tabindex=${o??y}
          aria-expanded=${n??y}
          aria-controls=${l??y}
          aria-disabled=${d??y}
          part="header"
          class="flex items-center justify-between p-4"
          @click=${this.handleHeaderClick}
          @keydown=${this.handleHeaderKeyDown}
        >
          <slot name="header"></slot>
          ${s?q`<span part="indicator" aria-hidden="true">&#x25B6;</span>`:y}
        </div>

        <div
          id=${u??y}
          role=${h??y}
          aria-labelledby=${p??y}
          ?hidden=${v}
          part="body"
        >
          <slot></slot>
        </div>

        <div part="footer">
          <slot name="footer"></slot>
        </div>
      </div>
    `}}const Fn=q`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,Nn=q`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,Vn=q`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;class zn extends de{static elementName="cv-copy-button";static get properties(){return{value:{attribute:!1},disabled:{type:Boolean,reflect:!0},feedbackDuration:{type:Number,reflect:!0,attribute:"feedback-duration"},size:{type:String,reflect:!0}}}__clipboard;model;get _clipboard(){return this.__clipboard}set _clipboard(e){this.__clipboard=e,this.model=this._createModel(),this.requestUpdate()}constructor(){super(),this.value="",this.disabled=!1,this.feedbackDuration=1500,this.size="medium",this.model=this._createModel()}static styles=[Q`
      :host {
        display: inline-block;
        --cv-copy-button-size: 36px;
        --cv-copy-button-border-radius: var(--cv-radius-sm, 6px);
        --cv-copy-button-success-color: var(--cv-color-success, #4ade80);
        --cv-copy-button-error-color: var(--cv-color-danger, #ff7d86);
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--cv-copy-button-size);
        height: var(--cv-copy-button-size);
        border-radius: var(--cv-copy-button-border-radius);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
        user-select: none;
        padding: 0;
        position: relative;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='base']:hover {
        border-color: var(--cv-color-primary, #65d7ff);
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      [part='copy-icon'],
      [part='success-icon'],
      [part='error-icon'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
      }

      [part='copy-icon'] svg,
      [part='success-icon'] svg,
      [part='error-icon'] svg,
      [part='copy-icon'] ::slotted(svg),
      [part='success-icon'] ::slotted(svg),
      [part='error-icon'] ::slotted(svg) {
        width: 50%;
        height: 50%;
      }

      [part='status'] {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }

      /* --- disabled --- */
      :host([disabled]) {
        opacity: 0.55;
        cursor: not-allowed;
      }

      :host([disabled]) [part='base'] {
        cursor: not-allowed;
        pointer-events: none;
      }

      /* --- status: idle --- */
      :host([status='idle']) [part='success-icon'],
      :host([status='idle']) [part='error-icon'] {
        display: none;
      }

      /* --- status: success --- */
      :host([status='success']) [part='base'] {
        color: var(--cv-copy-button-success-color);
        border-color: var(--cv-copy-button-success-color);
      }

      :host([status='success']) [part='copy-icon'],
      :host([status='success']) [part='error-icon'] {
        display: none;
      }

      /* --- status: error --- */
      :host([status='error']) [part='base'] {
        color: var(--cv-copy-button-error-color);
        border-color: var(--cv-copy-button-error-color);
      }

      :host([status='error']) [part='copy-icon'],
      :host([status='error']) [part='success-icon'] {
        display: none;
      }

      /* --- copying --- */
      :host([copying]) {
        cursor: progress;
      }

      :host([copying]) [part='base'] {
        cursor: progress;
      }

      /* --- sizes --- */
      :host([size='small']) {
        --cv-copy-button-size: 30px;
      }

      :host([size='large']) {
        --cv-copy-button-size: 42px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}_createModel(){return dn({value:this.value,isDisabled:this.disabled,feedbackDuration:this.feedbackDuration,clipboard:this.__clipboard,onCopy:e=>{this.dispatchEvent(new CustomEvent("cv-copy",{detail:{value:e},bubbles:!0,composed:!0}))},onError:e=>{this.dispatchEvent(new CustomEvent("cv-error",{detail:{error:e},bubbles:!0,composed:!0}))}})}willUpdate(e){super.willUpdate(e),e.has("disabled")&&this.model.actions.setDisabled(this.disabled),e.has("feedbackDuration")&&this.model.actions.setFeedbackDuration(this.feedbackDuration),e.has("value")&&this.model.actions.setValue(this.value)}_syncHostAttributes(){const e=this.model.state.status(),t=this.model.state.isCopying();this.setAttribute("status",e),t?this.setAttribute("copying",""):this.removeAttribute("copying")}handleClick(e){this.model.contracts.getButtonProps().onClick(e)}handleKeyDown(e){this.model.contracts.getButtonProps().onKeyDown(e)}handleKeyUp(e){this.model.contracts.getButtonProps().onKeyUp(e)}render(){this._syncHostAttributes();const e=this.model.contracts.getButtonProps(),t=this.model.contracts.getStatusProps(),s=this.model.contracts.getIconContainerProps("copy"),a=this.model.contracts.getIconContainerProps("success"),r=this.model.contracts.getIconContainerProps("error"),o=this.model.state.status(),n=o==="success"?"Copied":o==="error"?"Copy failed":y;return q`
      <div
        part="base"
        role=${e.role}
        tabindex=${e.tabindex}
        aria-disabled=${e["aria-disabled"]}
        aria-label=${e["aria-label"]??y}
        @click=${this.handleClick}
        @keydown=${this.handleKeyDown}
        @keyup=${this.handleKeyUp}
      >
        <span
          part="copy-icon"
          aria-hidden=${s["aria-hidden"]}
          .hidden=${s.hidden??!1}
        >
          <slot name="copy-icon">${Fn}</slot>
        </span>
        <span
          part="success-icon"
          aria-hidden=${a["aria-hidden"]}
          .hidden=${a.hidden??!1}
        >
          <slot name="success-icon">${Nn}</slot>
        </span>
        <span
          part="error-icon"
          aria-hidden=${r["aria-hidden"]}
          .hidden=${r.hidden??!1}
        >
          <slot name="error-icon">${Vn}</slot>
        </span>
        <span
          part="status"
          role=${t.role}
          aria-live=${t["aria-live"]}
          aria-atomic=${t["aria-atomic"]}
        >${n}</span>
      </div>
    `}}class Oa extends ve{static elementName="cv-carousel-slide";static get properties(){return{value:{type:String,reflect:!0},label:{type:String,reflect:!0},active:{type:Boolean,reflect:!0}}}constructor(){super(),this.value="",this.label="",this.active=!1}static styles=[Q`
      :host {
        display: block;
      }

      :host([hidden]) {
        display: none;
      }

      [part='base'] {
        display: block;
        min-block-size: 120px;
        padding: var(--cv-space-4, 16px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      :host([active]) [part='base'] {
        border-color: var(--cv-color-primary, #65d7ff);
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<div part="base"><slot></slot></div>`}}const Kn=new Set(["ArrowLeft","ArrowRight","Home","End"]);let _n=0;class Bs extends de{static elementName="cv-carousel";static get properties(){return{value:{type:String,reflect:!0},activeIndex:{type:Number,attribute:"active-index",reflect:!0},autoplay:{type:Boolean,reflect:!0},autoplayInterval:{type:Number,attribute:"autoplay-interval",reflect:!0},visibleSlides:{type:Number,attribute:"visible-slides",reflect:!0},paused:{type:Boolean,reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},ariaLabelledBy:{type:String,attribute:"aria-labelledby"}}}idBase=`cv-carousel-${++_n}`;slideRecords=[];model;swipeStartX=0;swipeStartY=0;isSwiping=!1;constructor(){super(),this.value="",this.activeIndex=0,this.autoplay=!1,this.autoplayInterval=5e3,this.visibleSlides=1,this.paused=!1,this.ariaLabel="",this.ariaLabelledBy="",this.model=Li({idBase:this.idBase,slides:[]})}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-2, 8px);
      }

      [part='controls'] {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cv-space-1, 4px);
      }

      [part='slides'] {
        display: grid;
        gap: var(--cv-space-2, 8px);
      }

      [part='indicators'] {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cv-space-1, 4px);
      }

      button[part~='control'],
      button[part~='indicator'] {
        min-block-size: 32px;
        min-inline-size: 32px;
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
      }

      button[part~='indicator'][data-active='true'] {
        border-color: var(--cv-color-primary, #65d7ff);
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.rebuildModelFromSlot(!1,!1)}willUpdate(e){if(super.willUpdate(e),e.has("autoplay")||e.has("autoplayInterval")||e.has("visibleSlides")||e.has("ariaLabel")||e.has("ariaLabelledBy")){this.rebuildModelFromSlot(!0,!1);return}if(e.has("activeIndex")&&this.activeIndex!==this.model.state.activeSlideIndex()){const t=this.captureSnapshot();this.model.actions.moveTo(this.activeIndex),this.applyInteractionResult(t)}if(e.has("value")){const t=this.value.trim();this.value!==t&&(this.value=t);const s=this.slideRecords.findIndex(a=>a.id===t);if(s>=0&&s!==this.model.state.activeSlideIndex()){const a=this.captureSnapshot();this.model.actions.moveTo(s),this.applyInteractionResult(a)}}if(e.has("paused")&&this.paused!==this.model.state.isPaused()){const t=this.captureSnapshot();this.paused?this.model.actions.pause():this.model.actions.play(),this.applyInteractionResult(t)}}updated(e){if(super.updated(e),!e.has("activeIndex")&&!e.has("value")&&!e.has("paused")){const s={activeIndex:this.activeIndex,paused:this.paused};this.syncControlledValuesFromModel(),this.dispatchStateEvents(s,this.captureSnapshot())}this.syncSlideElements()}next(){const e=this.captureSnapshot();this.model.actions.moveNext(),this.applyInteractionResult(e)}prev(){const e=this.captureSnapshot();this.model.actions.movePrev(),this.applyInteractionResult(e)}play(){const e=this.captureSnapshot();this.model.actions.play(),this.applyInteractionResult(e)}pause(){const e=this.captureSnapshot();this.model.actions.pause(),this.applyInteractionResult(e)}getSlideElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===Oa.elementName)}ensureSlideValue(e,t){const s=e.value?.trim();if(s)return s;const a=`slide-${t+1}`;return e.value=a,a}rebuildModelFromSlot(e,t=!0){const s=e?this.captureSnapshot():{activeIndex:this.activeIndex,paused:this.paused},a=e?this.slideRecords[s.activeIndex]?.id??null:null;this.slideRecords=this.getSlideElements().map((d,u)=>({id:this.ensureSlideValue(d,u),label:d.label||d.textContent?.trim()||`Slide ${u+1}`,element:d}));const r=a==null?-1:this.slideRecords.findIndex(d=>d.id===a),o=this.value?.trim(),n=!e&&o?this.slideRecords.findIndex(d=>d.id===o):-1,l=n>=0?n:r>=0?r:s.activeIndex;this.model=Li({idBase:this.idBase,slides:this.slideRecords.map(d=>({id:d.id,label:d.label})),ariaLabel:this.ariaLabel||void 0,ariaLabelledBy:this.ariaLabelledBy||void 0,autoplay:this.autoplay,autoplayIntervalMs:this.autoplayInterval,visibleSlides:this.visibleSlides,initialActiveSlideIndex:l,initialPaused:s.paused}),this.syncSlideElements(),this.syncControlledValuesFromModel(),t&&this.requestUpdate()}syncSlideElements(){for(const[e,t]of this.slideRecords.entries()){const s=this.model.contracts.getSlideProps(e);t.element.id=s.id,t.element.setAttribute("role",s.role),t.element.setAttribute("aria-roledescription",s["aria-roledescription"]),t.element.setAttribute("aria-label",s["aria-label"]),t.element.setAttribute("aria-hidden",s["aria-hidden"]),t.element.setAttribute("data-active",s["data-active"]),t.element.active=s["data-active"]==="true",t.element.hidden=s["aria-hidden"]==="true"}}syncControlledValuesFromModel(){const e=this.model.state.activeSlideIndex();this.activeIndex=e,this.value=this.slideRecords[e]?.id??"",this.paused=this.model.state.isPaused()}captureSnapshot(){return{activeIndex:this.model.state.activeSlideIndex(),paused:this.model.state.isPaused()}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}applyInteractionResult(e){this.syncSlideElements();const t=this.captureSnapshot();this.syncControlledValuesFromModel(),this.dispatchStateEvents(e,t)}dispatchStateEvents(e,t){const s=e.activeIndex!==t.activeIndex,a=e.paused!==t.paused;if(!s&&!a)return;const r={activeIndex:t.activeIndex,activeValue:this.value||null,paused:t.paused};this.dispatchInput(r),s&&this.dispatchChange(r)}handleRootFocusIn(){const e=this.captureSnapshot();this.model.contracts.getRootProps().onFocusIn(),this.applyInteractionResult(e)}handleRootFocusOut(){const e=this.captureSnapshot();this.model.contracts.getRootProps().onFocusOut(),this.applyInteractionResult(e)}handleRootPointerEnter(){const e=this.captureSnapshot();this.model.contracts.getRootProps().onPointerEnter(),this.applyInteractionResult(e)}handleRootPointerLeave(){const e=this.captureSnapshot();this.model.contracts.getRootProps().onPointerLeave(),this.applyInteractionResult(e)}handleKeyDown(e){Kn.has(e.key)&&e.preventDefault();const t=this.captureSnapshot();this.model.actions.handleKeyDown({key:e.key}),this.applyInteractionResult(t)}handlePrevClick(){const e=this.captureSnapshot();this.model.contracts.getPrevButtonProps().onClick(),this.applyInteractionResult(e)}handleNextClick(){const e=this.captureSnapshot();this.model.contracts.getNextButtonProps().onClick(),this.applyInteractionResult(e)}handlePlayPauseClick(){const e=this.captureSnapshot();this.model.contracts.getPlayPauseButtonProps().onClick(),this.applyInteractionResult(e)}handleIndicatorClick=e=>{const t=this.captureSnapshot();this.model.contracts.getIndicatorProps(e).onClick(),this.applyInteractionResult(t)};handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}static SWIPE_THRESHOLD=30;handleSlidesPointerDown(e){this.swipeStartX=e.clientX,this.swipeStartY=e.clientY,this.isSwiping=!0}handleSlidesPointerMove(e){this.isSwiping}handleSlidesPointerUp(e){if(!this.isSwiping)return;this.isSwiping=!1;const t=e.clientX-this.swipeStartX,s=e.clientY-this.swipeStartY,a=Math.abs(t),r=Math.abs(s);a<Bs.SWIPE_THRESHOLD||r>a||(t>0?this.prev():this.next())}render(){const e=this.model.contracts.getRootProps(),t=this.model.contracts.getSlideGroupProps(),s=this.model.contracts.getPrevButtonProps(),a=this.model.contracts.getNextButtonProps(),r=this.model.contracts.getPlayPauseButtonProps();return q`
      <section
        id=${e.id}
        role=${e.role}
        aria-roledescription=${e["aria-roledescription"]}
        aria-label=${e["aria-label"]??y}
        aria-labelledby=${e["aria-labelledby"]??y}
        aria-live=${e["aria-live"]}
        tabindex="0"
        part="base"
        @keydown=${this.handleKeyDown}
        @focusin=${this.handleRootFocusIn}
        @focusout=${this.handleRootFocusOut}
        @pointerenter=${this.handleRootPointerEnter}
        @pointerleave=${this.handleRootPointerLeave}
      >
        <div part="controls">
          <button
            id=${s.id}
            role=${s.role}
            tabindex=${s.tabindex}
            aria-controls=${s["aria-controls"]}
            aria-label=${s["aria-label"]}
            part="control prev"
            @click=${this.handlePrevClick}
          >
            Prev
          </button>

          <button
            id=${a.id}
            role=${a.role}
            tabindex=${a.tabindex}
            aria-controls=${a["aria-controls"]}
            aria-label=${a["aria-label"]}
            part="control next"
            @click=${this.handleNextClick}
          >
            Next
          </button>

          <button
            id=${r.id}
            role=${r.role}
            tabindex=${r.tabindex}
            aria-controls=${r["aria-controls"]}
            aria-label=${r["aria-label"]}
            part="control play-pause"
            @click=${this.handlePlayPauseClick}
          >
            ${this.model.state.isPaused()?"Play":"Pause"}
          </button>
        </div>

        <div
          id=${t.id}
          role=${t.role}
          aria-label=${t["aria-label"]??y}
          part="slides"
          @pointerdown=${this.handleSlidesPointerDown}
          @pointermove=${this.handleSlidesPointerMove}
          @pointerup=${this.handleSlidesPointerUp}
        >
          <slot @slotchange=${this.handleSlotChange}></slot>
        </div>

        <div part="indicators">
          ${this.slideRecords.map((o,n)=>{const l=this.model.contracts.getIndicatorProps(n);return q`
              <button
                id=${l.id}
                role=${l.role}
                tabindex=${l.tabindex}
                aria-controls=${l["aria-controls"]}
                aria-label=${l["aria-label"]}
                aria-current=${l["aria-current"]??y}
                data-active=${l["data-active"]}
                part="indicator"
                @click=${()=>this.handleIndicatorClick(n)}
              >
                ${n+1}
              </button>
            `})}
        </div>
      </section>
    `}}let Un=0;class Ps extends Le{static elementName="cv-checkbox";static forwardedHostAttributes=["tabindex","aria-label","aria-labelledby","aria-describedby"];static get properties(){return{name:{type:String},value:{type:String},checked:{type:Boolean,reflect:!0},indeterminate:{type:Boolean,reflect:!0},disabled:{type:Boolean,reflect:!0},readOnly:{type:Boolean,attribute:"read-only",reflect:!0},required:{type:Boolean,reflect:!0}}}static get observedAttributes(){return[...new Set([...super.observedAttributes,...this.forwardedHostAttributes])]}idBase=`cv-checkbox-${++Un}`;model;defaultChecked=!1;defaultIndeterminate=!1;didCaptureDefaultState=!1;constructor(){super(),this.name="",this.value="on",this.checked=!1,this.indeterminate=!1,this.disabled=!1,this.readOnly=!1,this.required=!1,this.model=this.createModel()}get mixed(){return this.indeterminate}set mixed(e){this.indeterminate=e}static styles=[Q`
      :host {
        display: inline-block;
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-space-2, 8px);
        cursor: pointer;
        user-select: none;
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='indicator'] {
        inline-size: 18px;
        block-size: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        transition:
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='checkmark'] {
        inline-size: 10px;
        block-size: 10px;
        border-radius: 2px;
        background: transparent;
        transition: background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([checked]) [part='indicator'] {
        border-color: var(--cv-color-primary, #65d7ff);
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 24%, var(--cv-color-surface, #141923));
      }

      :host([checked]) [part='checkmark'] {
        background: var(--cv-color-primary, #65d7ff);
      }

      :host([indeterminate]) [part='checkmark'] {
        inline-size: 10px;
        block-size: 2px;
        border-radius: 999px;
        background: var(--cv-color-primary, #65d7ff);
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
        cursor: not-allowed;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.didCaptureDefaultState||(this.defaultChecked=this.checked,this.defaultIndeterminate=this.indeterminate,this.didCaptureDefaultState=!0)}attributeChangedCallback(e,t,s){super.attributeChangedCallback(e,t,s),t!==s&&Ps.forwardedHostAttributes.includes(e)&&this.requestUpdate()}willUpdate(e){if(super.willUpdate(e),e.has("disabled")&&this.model.actions.setDisabled(this.isEffectivelyDisabled()),e.has("readOnly")&&this.model.actions.setReadOnly(this.readOnly),e.has("checked")||e.has("indeterminate")){const t=this.indeterminate?"mixed":this.checked;this.model.state.checked()!==t&&this.model.actions.setChecked(t)}(e.has("checked")||e.has("indeterminate")||e.has("disabled")||e.has("required")||e.has("name")||e.has("value"))&&this.syncFormAssociatedState()}createModel(){return yo({idBase:this.idBase,allowMixed:!0,checked:this.indeterminate?"mixed":this.checked,isDisabled:this.isEffectivelyDisabled(),isReadOnly:this.readOnly})}onFormDisabledChanged(e){this.model.actions.setDisabled(this.isEffectivelyDisabled())}onFormReset(){const e=this.defaultIndeterminate?"mixed":this.defaultChecked;this.checked=this.defaultChecked,this.indeterminate=this.defaultIndeterminate,this.model.actions.setChecked(e)}onFormStateRestore(e){const t=typeof e=="string";this.checked=t,this.indeterminate=!1,this.model.actions.setChecked(t)}isFormAssociatedDisabled(){return this.isEffectivelyDisabled()}getFormAssociatedValue(){return!this.checked||this.indeterminate?null:this.value||"on"}getFormAssociatedValidity(){return this.required&&(!this.checked||this.indeterminate)?{flags:{valueMissing:!0},message:"Please check this box."}:{flags:{}}}isEffectivelyDisabled(){return this.disabled||this.formDisabled}dispatchCheckboxEvent(e,t){this.dispatchEvent(new CustomEvent(e,{detail:t,bubbles:!0,composed:!0}))}dispatchInput(e){this.dispatchCheckboxEvent("cv-input",e)}dispatchChange(e){this.dispatchCheckboxEvent("cv-change",e)}syncFromModelAndEmit(e){const t=this.model.state.checked();if(this.checked=t===!0,this.indeterminate=t==="mixed",this.syncFormAssociatedState(),e===t)return;const s={value:t,checked:t===!0,indeterminate:t==="mixed"};this.dispatchInput(s),this.dispatchChange(s)}handleClick(){const e=this.model.state.checked();this.model.contracts.getCheckboxProps().onClick(),this.syncFromModelAndEmit(e)}handleKeyDown(e){const t=this.model.state.checked();this.model.contracts.getCheckboxProps().onKeyDown(e),this.syncFromModelAndEmit(t)}render(){const e=this.model.contracts.getCheckboxProps(),t=this.getAttribute("tabindex"),s=this.getAttribute("aria-label"),a=this.getAttribute("aria-labelledby"),r=this.getAttribute("aria-describedby"),o=this.isEffectivelyDisabled()?"-1":t??e.tabindex;return q`
      <div
        id=${e.id}
        role=${e.role}
        tabindex=${o}
        aria-checked=${e["aria-checked"]}
        aria-label=${s??y}
        aria-disabled=${e["aria-disabled"]??y}
        aria-readonly=${e["aria-readonly"]??y}
        aria-required=${this.required?"true":y}
        aria-labelledby=${a??e["aria-labelledby"]??y}
        aria-describedby=${r??e["aria-describedby"]??y}
        part="base"
        @click=${this.handleClick}
        @keydown=${this.handleKeyDown}
      >
        <span part="indicator">
          <span part="checkmark"></span>
        </span>
        <slot></slot>
      </div>
    `}}class Ma extends ve{static elementName="cv-command-item";static get properties(){return{value:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0},selected:{type:Boolean,reflect:!0}}}constructor(){super(),this.value="",this.disabled=!1,this.active=!1,this.selected=!1}static styles=[Q`
      :host {
        display: block;
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      [part='base'] {
        display: block;
        padding: var(--cv-space-2, 8px) var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        color: var(--cv-color-text, #e8ecf6);
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([active]) [part='base'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 24%, transparent);
      }

      :host([selected]) [part='base'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 32%, transparent);
      }

      :host([disabled]) [part='base'] {
        opacity: 0.5;
      }

      :host(:focus-visible) [part='base'] {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<div part="base"><slot></slot></div>`}}const qn=new Set(["ArrowUp","ArrowDown","Home","End","Enter","Escape"]);let Hn=0;class jn extends de{static elementName="cv-command-palette";static get properties(){return{value:{type:String,reflect:!0},inputValue:{type:String,attribute:"input-value"},open:{type:Boolean,reflect:!0},lastExecutedValue:{attribute:!1},placeholder:{type:String},ariaLabel:{type:String,attribute:"aria-label"},openShortcutKey:{type:String,attribute:"open-shortcut-key"},closeOnExecute:{type:Boolean,attribute:"close-on-execute",reflect:!0},closeOnOutsidePointer:{type:Boolean,attribute:"close-on-outside-pointer",reflect:!0},listenGlobalShortcut:{type:Boolean,attribute:"listen-global-shortcut",reflect:!0}}}idBase=`cv-command-palette-${++Hn}`;itemRecords=[];itemListeners=new WeakMap;model;constructor(){super(),this.value="",this.inputValue="",this.open=!1,this.lastExecutedValue=null,this.placeholder="",this.ariaLabel="",this.openShortcutKey="k",this.closeOnExecute=!0,this.closeOnOutsidePointer=!0,this.listenGlobalShortcut=!0}static styles=[Q`
      :host {
        display: inline-block;
      }

      [part='base'] {
        display: inline-grid;
        gap: var(--cv-space-1, 4px);
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 36px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='dialog'] {
        position: fixed;
        inset-inline: 16px;
        inset-block-start: 10vh;
        z-index: 90;
        inline-size: min(640px, calc(100vw - 32px));
        margin-inline: auto;
        display: grid;
        gap: var(--cv-space-2, 8px);
        padding: var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-lg, 14px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        box-shadow: var(--cv-shadow-2, 0 8px 30px rgba(0, 0, 0, 0.35));
      }

      [part='dialog'][hidden] {
        display: none;
      }

      [part='input'] {
        inline-size: 100%;
        min-block-size: 38px;
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        padding: 0 var(--cv-space-3, 12px);
      }

      [part='input']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='listbox'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
        max-block-size: min(420px, 60vh);
        overflow: auto;
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.model||this.rebuildModelFromSlot(!1,!1),this.syncOutsidePointerListener(),this.syncGlobalShortcutListener()}disconnectedCallback(){super.disconnectedCallback(),this.detachItemListeners(),this.syncOutsidePointerListener(!0),this.syncGlobalShortcutListener(!0)}willUpdate(e){if(super.willUpdate(e),e.has("ariaLabel")||e.has("openShortcutKey")||e.has("closeOnExecute")||e.has("closeOnOutsidePointer")){this.rebuildModelFromSlot(!0,!1);return}if(this.model){if(e.has("open")&&this.model.state.isOpen()!==this.open){const t=this.captureState();this.open?this.model.actions.open():this.model.actions.close(),this.applyInteractionResult(t)}if(e.has("value")){const t=this.value.trim();if(this.value!==t&&(this.value=t),t.length>0&&t!==this.model.state.selectedId()){const s=this.captureState();this.model.actions.execute(t),this.applyInteractionResult(s)}}if(e.has("inputValue")&&this.model.state.inputValue()!==this.inputValue){const t=this.captureState();this.model.actions.setInputValue(this.inputValue),this.applyInteractionResult(t)}}}updated(e){super.updated(e),this.syncOutsidePointerListener(),this.syncGlobalShortcutListener(),!e.has("open")&&!e.has("value")&&!e.has("inputValue")&&this.syncItemElements(),e.has("open")&&this.open&&this.focusInput()}openPalette(){if(!this.model)return;const e=this.captureState();this.model.actions.open(),this.applyInteractionResult(e)}closePalette(){if(!this.model)return;const e=this.captureState();this.model.actions.close(),this.applyInteractionResult(e)}getItemElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===Ma.elementName)}ensureItemValue(e,t){const s=e.value?.trim();if(s)return s;const a=`command-${t+1}`;return e.value=a,a}rebuildModelFromSlot(e,t=!0){const s=this.getItemElements(),a=e?this.captureState():{value:this.value.trim()||null,inputValue:this.inputValue,activeId:null,open:this.open,lastExecutedValue:this.lastExecutedValue};this.detachItemListeners(),this.itemRecords=s.map((n,l)=>{const d=this.ensureItemValue(n,l),u=n.textContent?.trim()||d;return{id:d,label:u,disabled:n.disabled,element:n}});const r=new Set(this.itemRecords.map(n=>n.id)),o=new Set(this.itemRecords.filter(n=>!n.disabled).map(n=>n.id));this.model=sn({idBase:this.idBase,commands:this.itemRecords.map(n=>({id:n.id,label:n.label,disabled:n.disabled})),ariaLabel:this.ariaLabel||void 0,initialOpen:a.open,openShortcutKey:this.openShortcutKey,closeOnExecute:this.closeOnExecute,closeOnOutsidePointer:this.closeOnOutsidePointer}),a.value&&r.has(a.value)&&this.model.state.selectedId.set(a.value),a.activeId&&o.has(a.activeId)&&this.model.state.activeId.set(a.activeId),a.inputValue.length>0&&this.model.state.inputValue.set(a.inputValue),a.lastExecutedValue&&r.has(a.lastExecutedValue)&&this.model.state.lastExecutedId.set(a.lastExecutedValue),this.attachItemListeners(),this.syncItemElements(),this.value=this.model.state.selectedId()??"",this.inputValue=this.model.state.inputValue(),this.open=this.model.state.isOpen(),this.lastExecutedValue=this.model.state.lastExecutedId(),t&&this.requestUpdate()}detachItemListeners(){for(const e of this.itemRecords){const t=this.itemListeners.get(e.element);t&&(e.element.removeEventListener("click",t.click),this.itemListeners.delete(e.element))}}attachItemListeners(){if(this.model)for(const e of this.itemRecords){const t=s=>{s.preventDefault(),this.handleItemClick(e.id)};e.element.addEventListener("click",t),this.itemListeners.set(e.element,{click:t})}}syncItemElements(){if(!this.model)return;const e=new Set(this.model.contracts.getVisibleCommands().map(s=>s.id)),t=this.model.state.selectedId();for(const s of this.itemRecords){const a=this.model.contracts.getOptionProps(s.id);s.element.id=a.id,s.element.setAttribute("role",a.role),s.element.setAttribute("tabindex",a.tabindex);const r=t===s.id;s.element.setAttribute("aria-selected",r?"true":"false"),a["aria-disabled"]?s.element.setAttribute("aria-disabled",a["aria-disabled"]):s.element.removeAttribute("aria-disabled"),s.element.setAttribute("data-active",a["data-active"]),s.element.active=a["data-active"]==="true",s.element.selected=r,s.element.disabled=a["aria-disabled"]==="true",s.element.hidden=!this.open||!e.has(s.id)}}captureState(){return{value:this.model?.state.selectedId()??(this.value.trim()||null),inputValue:this.model?.state.inputValue()??this.inputValue,activeId:this.model?.state.activeId()??null,open:this.model?.state.isOpen()??this.open,lastExecutedValue:this.model?.state.lastExecutedId()??this.lastExecutedValue,restoreTargetId:this.model?.state.restoreTargetId()??null}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}dispatchExecute(e){this.dispatchEvent(new CustomEvent("cv-execute",{detail:e,bubbles:!0,composed:!0}))}focusInput(){this.shadowRoot?.querySelector('[part="input"]')?.focus()}applyInteractionResult(e){if(!this.model)return;const t=this.captureState();this.value=t.value??"",this.inputValue=t.inputValue,this.open=t.open,this.lastExecutedValue=t.lastExecutedValue,this.syncItemElements();const s=e.value!==t.value,a=e.inputValue!==t.inputValue,r=e.activeId!==t.activeId,o=e.open!==t.open,n=e.lastExecutedValue!==t.lastExecutedValue;if(s||a||r||o||n){const l={value:t.value,inputValue:t.inputValue,activeId:t.activeId,open:t.open,lastExecutedValue:t.lastExecutedValue};this.dispatchInput(l),s&&this.dispatchChange(l),n&&t.lastExecutedValue&&this.dispatchExecute(l)}!t.open&&t.restoreTargetId&&e.restoreTargetId!==t.restoreTargetId&&this.shadowRoot?.querySelector(`[id="${t.restoreTargetId}"]`)?.focus()}syncOutsidePointerListener(e=!1){!e&&this.open?document.addEventListener("pointerdown",this.handleDocumentPointerDown):document.removeEventListener("pointerdown",this.handleDocumentPointerDown)}syncGlobalShortcutListener(e=!1){!e&&this.listenGlobalShortcut?document.addEventListener("keydown",this.handleDocumentKeyDown):document.removeEventListener("keydown",this.handleDocumentKeyDown)}handleDocumentPointerDown=e=>{if(!this.model||!this.model.state.isOpen()||e.composedPath().includes(this))return;const s=this.captureState();this.model.actions.handleOutsidePointer(),this.applyInteractionResult(s)};handleDocumentKeyDown=e=>{if(!this.model||!this.listenGlobalShortcut||!((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()===this.openShortcutKey.toLowerCase()))return;e.preventDefault();const s=this.captureState();this.model.actions.handleGlobalKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(s)};handleTriggerClick(){if(!this.model)return;const e=this.captureState();this.model.contracts.getTriggerProps().onClick(),this.applyInteractionResult(e)}handleTriggerKeyDown(e){if(this.model&&(e.key==="Enter"||e.key===" "||e.key==="Spacebar")){e.preventDefault();const t=this.captureState();this.model.contracts.getTriggerProps().onClick(),this.applyInteractionResult(t)}}handleDialogKeyDown(e){if(!this.model)return;qn.has(e.key)&&e.preventDefault();const t=this.captureState();this.model.contracts.getDialogProps().onKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(t)}handleInputChange(e){if(!this.model)return;const t=this.captureState();this.model.actions.setInputValue(e.currentTarget.value),this.applyInteractionResult(t)}handleInputKeyDown(e){e.stopPropagation(),this.handleDialogKeyDown(e)}handleItemClick(e){if(!this.model)return;const t=this.captureState();this.model.contracts.getOptionProps(e).onClick(),this.applyInteractionResult(t)}handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}render(){const e=this.model?.contracts.getTriggerProps()??{id:`${this.idBase}-trigger`,role:"button",tabindex:"0","aria-haspopup":"dialog","aria-expanded":this.open?"true":"false","aria-controls":`${this.idBase}-dialog`},t=this.model?.contracts.getDialogProps()??{id:`${this.idBase}-dialog`,role:"dialog",tabindex:"-1",hidden:!this.open,"aria-modal":"true","aria-label":this.ariaLabel||void 0},s=this.model?.contracts.getInputProps()??{id:`${this.idBase}-input`,role:"combobox",tabindex:"0","aria-haspopup":"listbox","aria-expanded":this.open?"true":"false","aria-controls":`${this.idBase}-listbox`,"aria-autocomplete":"list","aria-activedescendant":void 0,"aria-label":this.ariaLabel||void 0},a=this.model?.contracts.getListboxProps()??{id:`${this.idBase}-listbox`,role:"listbox",tabindex:"-1","aria-label":this.ariaLabel||void 0};return q`
      <div part="base">
        <button
          id=${e.id}
          role=${e.role}
          tabindex=${e.tabindex}
          aria-haspopup=${e["aria-haspopup"]}
          aria-expanded=${e["aria-expanded"]}
          aria-controls=${e["aria-controls"]}
          part="trigger"
          type="button"
          @click=${this.handleTriggerClick}
          @keydown=${this.handleTriggerKeyDown}
        >
          <slot name="trigger">Command palette</slot>
        </button>

        <div
          id=${t.id}
          role=${t.role}
          tabindex=${t.tabindex}
          aria-modal=${t["aria-modal"]}
          aria-label=${t["aria-label"]??y}
          ?hidden=${t.hidden}
          part="dialog"
          @keydown=${this.handleDialogKeyDown}
        >
          <input
            id=${s.id}
            role=${s.role}
            tabindex=${s.tabindex}
            aria-haspopup=${s["aria-haspopup"]}
            aria-expanded=${s["aria-expanded"]}
            aria-controls=${s["aria-controls"]}
            aria-autocomplete=${s["aria-autocomplete"]}
            aria-activedescendant=${s["aria-activedescendant"]??y}
            aria-label=${s["aria-label"]??y}
            .value=${this.inputValue}
            placeholder=${this.placeholder}
            part="input"
            @input=${this.handleInputChange}
            @keydown=${this.handleInputKeyDown}
          />

          <div
            id=${a.id}
            role=${a.role}
            tabindex=${a.tabindex}
            aria-label=${a["aria-label"]??y}
            part="listbox"
          >
            <slot @slotchange=${this.handleSlotChange}></slot>
          </div>
        </div>
      </div>
    `}}class Et extends ve{static elementName="cv-combobox-group";static get properties(){return{label:{type:String,reflect:!0}}}constructor(){super(),this.label=""}static styles=[Q`
      :host {
        display: block;
      }

      :host([hidden]) {
        display: none;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<slot></slot>`}}class qe extends ve{static elementName="cv-combobox-option";static get properties(){return{value:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},selected:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0}}}constructor(){super(),this.value="",this.disabled=!1,this.selected=!1,this.active=!1}static styles=[Q`
      :host {
        display: block;
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      .option {
        display: block;
        padding: var(--cv-space-2, 8px) var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        color: var(--cv-color-text, #e8ecf6);
        background: transparent;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([active]) .option {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 24%, transparent);
      }

      :host([selected]) .option {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 32%, transparent);
      }

      :host([disabled]) .option {
        opacity: 0.5;
      }

      :host(:focus-visible) .option {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<div class="option" part="base"><slot></slot></div>`}}const Gn=new Set(["ArrowUp","ArrowDown","Home","End","Enter","Escape"]);function Vi(i){return"options"in i&&Array.isArray(i.options)}let Wn=0;class Yn extends de{static elementName="cv-combobox";static get properties(){return{value:{type:String,reflect:!0},inputValue:{type:String,attribute:"input-value"},open:{type:Boolean,reflect:!0},type:{type:String,reflect:!0},multiple:{type:Boolean,reflect:!0},clearable:{type:Boolean,reflect:!0},maxTagsVisible:{type:Number,attribute:"max-tags-visible"},openOnFocus:{type:Boolean,attribute:"open-on-focus",reflect:!0},openOnClick:{type:Boolean,attribute:"open-on-click",reflect:!0},closeOnSelect:{type:Boolean,attribute:"close-on-select",reflect:!0},matchMode:{type:String,attribute:"match-mode",reflect:!0},placeholder:{type:String},ariaLabel:{type:String,attribute:"aria-label"}}}idBase=`cv-combobox-${++Wn}`;optionRecords=[];groupRecords=[];optionListeners=new WeakMap;model;constructor(){super(),this.value="",this.inputValue="",this.open=!1,this.type="editable",this.multiple=!1,this.clearable=!1,this.maxTagsVisible=3,this.openOnFocus=!0,this.openOnClick=!0,this.closeOnSelect=!0,this.matchMode="includes",this.placeholder="",this.ariaLabel=""}static styles=[Q`
      :host {
        display: inline-block;
        inline-size: 260px;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
      }

      [part='input-wrapper'] {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--cv-space-1, 4px);
        min-block-size: 36px;
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        padding: 0 var(--cv-space-3, 12px);
      }

      [part='input'] {
        flex: 1;
        min-inline-size: 60px;
        block-size: 100%;
        min-block-size: 36px;
        border: none;
        background: transparent;
        color: var(--cv-color-text, #e8ecf6);
        outline: none;
        padding: 0;
      }

      [part='input']:focus-visible {
        outline: none;
      }

      [part='trigger'] {
        flex: 1;
        display: flex;
        align-items: center;
        gap: var(--cv-space-2, 8px);
        min-block-size: 36px;
        border: none;
        background: transparent;
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
        outline: none;
        padding: 0;
      }

      [part='trigger']:focus-visible {
        outline: none;
      }

      [part='label'] {
        flex: 1;
        text-align: start;
      }

      [part='tags'] {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cv-space-1, 4px);
        align-items: center;
      }

      [part='tag'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-space-1, 4px);
        padding: 2px var(--cv-space-2, 8px);
        border-radius: var(--cv-radius-sm, 6px);
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 24%, transparent);
        font-size: 0.85em;
      }

      [part='tag-remove'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        padding: 0;
        font-size: 1em;
        line-height: 1;
      }

      [part='tag-overflow'] {
        font-size: 0.85em;
        color: var(--cv-color-text-muted, #9aa6bf);
      }

      [part='clear-button'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--cv-color-text-muted, #9aa6bf);
        cursor: pointer;
        padding: 0 var(--cv-space-1, 4px);
      }

      [part='expand-icon'] {
        display: inline-flex;
        align-items: center;
        color: var(--cv-color-text-muted, #9aa6bf);
      }

      [part='listbox'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
        max-block-size: 220px;
        overflow: auto;
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      [part='listbox'][hidden] {
        display: none;
      }

      [part='group'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
      }

      [part='group'][hidden] {
        display: none;
      }

      [part='group-label'] {
        padding: var(--cv-space-1, 4px) var(--cv-space-2, 8px);
        font-size: 0.75rem;
        letter-spacing: 0.02em;
        color: var(--cv-color-text-muted, #9aa6bf);
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.model||this.rebuildModelFromSlot(!1,!1),this.syncOutsidePointerListener()}disconnectedCallback(){super.disconnectedCallback(),this.detachOptionListeners(),this.syncOutsidePointerListener(!0)}willUpdate(e){if(super.willUpdate(e),e.has("ariaLabel")||e.has("closeOnSelect")||e.has("matchMode")||e.has("type")||e.has("multiple")||e.has("clearable")){this.rebuildModelFromSlot(!0,!1);return}if(this.model){if(e.has("value")){const t=this.value.trim(),s=this.captureState();if(t.length===0)this.model.actions.clearSelection(),this.applyInteractionResult(s);else if(this.multiple){const a=t.split(/\s+/).filter(Boolean),r=this.model.state.selectedIds();if(a.join(" ")!==r.join(" ")){this.model.actions.clearSelection();for(const o of a)this.model.actions.toggleOption(o);this.applyInteractionResult(s)}}else this.model.state.selectedId()!==t&&(this.model.actions.select(t),this.applyInteractionResult(s))}if(e.has("inputValue")&&this.model.state.inputValue()!==this.inputValue){const t=this.captureState();this.model.actions.setInputValue(this.inputValue),this.applyInteractionResult(t)}if(e.has("open")&&this.model.state.isOpen()!==this.open){const t=this.captureState();this.open?this.model.actions.open():this.model.actions.close(),this.applyInteractionResult(t)}}}updated(e){super.updated(e),this.syncOutsidePointerListener(),!e.has("value")&&!e.has("inputValue")&&!e.has("open")&&this.syncOptionElements()}getOptionElements(){const e=[];for(const t of Array.from(this.children))if(t.tagName.toLowerCase()===qe.elementName)e.push(t);else if(t.tagName.toLowerCase()===Et.elementName)for(const s of Array.from(t.children))s.tagName.toLowerCase()===qe.elementName&&e.push(s);return e}getGroupElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===Et.elementName)}ensureOptionValue(e,t){const s=e.value?.trim();if(s)return s;const a=`option-${t+1}`;return e.value=a,a}resolveInitialSelected(e){const t=this.value.trim();if(t.length>0)return t;for(const[s,a]of e.entries())if(a.selected&&!a.disabled)return this.ensureOptionValue(a,s);return null}rebuildModelFromSlot(e,t=!0){const s=this.getOptionElements(),a=this.getGroupElements(),r=e?this.captureState():{selectedId:this.resolveInitialSelected(s),selectedIds:this.multiple?this.value.trim().split(/\s+/).filter(Boolean):[],inputValue:this.inputValue,activeId:null,isOpen:this.open};this.detachOptionListeners();let o=0;this.groupRecords=a.map(f=>{const x=`group-${++o}`,m=f.label||f.getAttribute("label")||"";return Array.from(f.children).filter($=>$.tagName.toLowerCase()===qe.elementName),{id:x,label:m,element:f,optionIds:[]}});let n=0;this.optionRecords=[];const l=new Map;for(const f of this.groupRecords)l.set(f.element,f);for(const f of Array.from(this.children))if(f.tagName.toLowerCase()===qe.elementName){const x=f,m=this.ensureOptionValue(x,n),I=x.textContent?.trim()||m;this.optionRecords.push({id:m,label:I,disabled:x.disabled,element:x}),n++}else if(f.tagName.toLowerCase()===Et.elementName){const x=l.get(f);for(const m of Array.from(f.children))if(m.tagName.toLowerCase()===qe.elementName){const I=m,$=this.ensureOptionValue(I,n),T=I.textContent?.trim()||$,_={id:$,label:T,disabled:I.disabled,element:I,groupId:x?.id};this.optionRecords.push(_),x?.optionIds.push($),n++}}const d=new Set(this.optionRecords.filter(f=>!f.disabled).map(f=>f.id)),u=this.groupRecords.length>0;let h;if(u){h=[];const f=new Set;for(const x of Array.from(this.children))if(x.tagName.toLowerCase()===qe.elementName){const m=this.optionRecords.find(I=>I.element===x);m&&h.push({id:m.id,label:m.label,disabled:m.disabled})}else if(x.tagName.toLowerCase()===Et.elementName){const m=l.get(x);m&&!f.has(m.id)&&(f.add(m.id),h.push({id:m.id,label:m.label,options:m.optionIds.map(I=>{const $=this.optionRecords.find(T=>T.id===I);return{id:$.id,label:$.label,disabled:$.disabled}})}))}}else h=this.optionRecords.map(f=>({id:f.id,label:f.label,disabled:f.disabled}));let p=null,v;this.multiple?v=(r.selectedIds??[]).filter(x=>d.has(x)):p=r.selectedId&&d.has(r.selectedId)?r.selectedId:null;const g=this.multiple?!1:this.closeOnSelect;this.model=Ia({idBase:this.idBase,options:h,type:this.type,multiple:this.multiple,clearable:this.clearable,ariaLabel:this.ariaLabel||void 0,initialInputValue:r.inputValue,initialSelectedId:this.multiple?void 0:p,initialSelectedIds:this.multiple?v:void 0,initialOpen:r.isOpen,closeOnSelect:g,matchMode:this.matchMode==="startsWith"?"startsWith":"includes"}),r.activeId&&d.has(r.activeId)&&this.model.actions.setActive(r.activeId),this.attachOptionListeners(),this.syncOptionElements(),this.syncHostState(),t&&this.requestUpdate()}syncHostState(){if(this.model){if(this.multiple){const e=this.model.state.selectedIds();this.value=e.join(" ")}else this.value=this.model.state.selectedId()??"";this.inputValue=this.model.state.inputValue(),this.open=this.model.state.isOpen()}}detachOptionListeners(){for(const e of this.optionRecords){const t=this.optionListeners.get(e.element);t&&(e.element.removeEventListener("click",t.click),e.element.removeEventListener("mouseenter",t.mouseenter),this.optionListeners.delete(e.element))}}attachOptionListeners(){if(this.model)for(const e of this.optionRecords){const t=a=>{a.preventDefault(),this.handleOptionClick(e.id)},s=()=>{this.handleOptionMouseEnter(e.id)};e.element.addEventListener("click",t),e.element.addEventListener("mouseenter",s),this.optionListeners.set(e.element,{click:t,mouseenter:s})}}syncOptionElements(){if(!this.model)return;const e=this.model.state.isOpen(),t=this.model.contracts.getVisibleOptions(),s=new Set,a=new Set;for(const r of t)if(Vi(r)){a.add(r.id);for(const o of r.options)s.add(o.id)}else s.add(r.id);for(const r of this.optionRecords){const o=this.model.contracts.getOptionProps(r.id);r.element.id=o.id,r.element.setAttribute("role",o.role),r.element.setAttribute("tabindex",o.tabindex),r.element.setAttribute("aria-selected",o["aria-selected"]),o["aria-disabled"]?r.element.setAttribute("aria-disabled",o["aria-disabled"]):r.element.removeAttribute("aria-disabled"),o["data-active"]==="true"?(r.element.setAttribute("data-active","true"),r.element.active=!0):(r.element.removeAttribute("data-active"),r.element.active=!1),r.element.selected=o["aria-selected"]==="true",r.element.disabled=o["aria-disabled"]==="true",r.element.hidden=!e||!s.has(r.id)}for(const r of this.groupRecords){const o=r.optionIds.every(n=>!s.has(n));r.element.hidden=!e||o}}captureState(){return{selectedId:this.model?.state.selectedId()??(this.value.trim()||null),selectedIds:this.model?.state.selectedIds()??[],inputValue:this.model?.state.inputValue()??this.inputValue,activeId:this.model?.state.activeId()??null,isOpen:this.model?.state.isOpen()??this.open}}makeEventDetail(){const e=this.captureState();return{value:this.multiple?e.selectedIds.length>0?e.selectedIds.join(" "):null:e.selectedId,inputValue:e.inputValue,activeId:e.activeId,open:e.isOpen,selectedIds:e.selectedIds}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}applyInteractionResult(e){if(!this.model)return;this.syncOptionElements();const t=this.captureState();this.syncHostState();const s=this.multiple?e.selectedIds.join(" ")!==t.selectedIds.join(" "):e.selectedId!==t.selectedId,a=e.inputValue!==t.inputValue,r=e.activeId!==t.activeId,o=e.isOpen!==t.isOpen;if(!s&&!a&&!r&&!o)return;const n=this.makeEventDetail();this.dispatchInput(n),s&&this.dispatchChange(n)}syncOutsidePointerListener(e=!1){!e&&this.open?document.addEventListener("pointerdown",this.handleDocumentPointerDown):document.removeEventListener("pointerdown",this.handleDocumentPointerDown)}handleDocumentPointerDown=e=>{if(!this.model||!this.model.state.isOpen()||e.composedPath().includes(this))return;const s=this.captureState();this.model.actions.close(),this.applyInteractionResult(s)};handleInputChange(e){if(!this.model)return;const t=e.currentTarget.value,s=this.captureState();this.model.actions.setInputValue(t),this.applyInteractionResult(s)}handleInputFocus(){if(!this.model||this.model.state.isOpen()||!this.openOnFocus)return;const e=this.captureState();this.model.actions.open(),this.applyInteractionResult(e)}handleInputClick(){if(!this.model||this.model.state.isOpen()||!this.openOnClick)return;const e=this.captureState();this.model.actions.open(),this.applyInteractionResult(e)}handleKeyDown(e){if(!this.model)return;(Gn.has(e.key)||e.key===" ")&&e.preventDefault();const t=this.captureState();this.model.actions.handleKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(t)}handleOptionMouseEnter(e){if(!this.model)return;const t=this.captureState();this.model.actions.setActive(e),this.applyInteractionResult(t)}handleOptionClick(e){if(!this.model)return;const t=this.captureState();this.model.actions.select(e),this.applyInteractionResult(t)}handleClearClick(e){if(e.stopPropagation(),!this.model)return;const t=this.captureState();this.model.actions.clear(),this.applyInteractionResult(t),this.dispatchEvent(new CustomEvent("cv-clear",{detail:{},bubbles:!0,composed:!0}))}handleTagRemove(e){if(!this.model)return;const t=this.captureState();this.model.actions.removeSelected(e),this.applyInteractionResult(t)}handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}getSelectedOptionLabel(){if(!this.model)return this.placeholder;const e=this.model.state.selectedId();return e?this.optionRecords.find(s=>s.id===e)?.label??this.placeholder:this.placeholder}getSelectedRecords(){return this.model?this.model.state.selectedIds().map(t=>this.optionRecords.find(s=>s.id===t)).filter(t=>t!=null):[]}renderTags(){if(!this.multiple)return y;const e=this.getSelectedRecords();if(e.length===0)return y;const t=this.maxTagsVisible>0?this.maxTagsVisible:e.length,s=e.slice(0,t),a=e.length-t;return q`
      <div part="tags">
        ${s.map(r=>q`
            <span part="tag">
              <span part="tag-label">${r.label}</span>
              <button
                part="tag-remove"
                aria-label="Remove ${r.label}"
                @click=${o=>{o.stopPropagation(),this.handleTagRemove(r.id)}}
              >&times;</button>
            </span>
          `)}
        ${a>0?q`<span part="tag-overflow">+${a} more</span>`:y}
      </div>
    `}renderClearButton(){return!this.clearable||!this.model?.state.hasSelection()?y:q`
      <button part="clear-button" aria-label="Clear" @click=${this.handleClearClick}>&times;</button>
    `}renderListboxContent(){if(!this.model||this.groupRecords.length===0)return q`<slot @slotchange=${this.handleSlotChange}></slot>`;const e=this.model.contracts.getVisibleOptions(),t=new Set,s=new Map;for(const a of e)if(Vi(a)){t.add(a.id);const r=new Set(a.options.map(o=>o.id));s.set(a.id,r)}return q`
      ${this.groupRecords.map(a=>{const r=this.model.contracts.getGroupProps(a.id),o=this.model.contracts.getGroupLabelProps(a.id),n=t.has(a.id);return q`
          <div
            part="group"
            id=${r.id}
            role=${r.role}
            aria-labelledby=${r["aria-labelledby"]}
            ?hidden=${!this.open||!n}
          >
            <div
              part="group-label"
              id=${o.id}
              role=${o.role}
            >${a.label}</div>
            <slot name=${a.id}></slot>
          </div>
        `})}
      <slot @slotchange=${this.handleSlotChange}></slot>
    `}render(){const e=this.type==="select-only",t=this.model?.contracts.getInputProps()??{id:`${this.idBase}-input`,role:"combobox",tabindex:"0","aria-haspopup":"listbox","aria-expanded":this.open?"true":"false","aria-controls":`${this.idBase}-listbox`,"aria-autocomplete":e?void 0:"list","aria-activedescendant":void 0,"aria-label":this.ariaLabel||void 0},s=this.model?.contracts.getListboxProps()??{id:`${this.idBase}-listbox`,role:"listbox",tabindex:"-1","aria-label":this.ariaLabel||void 0},a=this.groupRecords.length>0;return q`
      <div part="base">
        <div part="input-wrapper">
          ${this.renderTags()}
          ${e?q`
                <div
                  id=${t.id}
                  role=${t.role}
                  tabindex=${t.tabindex}
                  aria-haspopup=${t["aria-haspopup"]}
                  aria-expanded=${t["aria-expanded"]}
                  aria-controls=${t["aria-controls"]}
                  aria-activedescendant=${t["aria-activedescendant"]??y}
                  aria-label=${t["aria-label"]??y}
                  part="trigger"
                  @click=${this.handleInputClick}
                  @keydown=${this.handleKeyDown}
                >
                  <span part="label">${this.getSelectedOptionLabel()}</span>
                </div>
              `:q`
                <input
                  id=${t.id}
                  role=${t.role}
                  tabindex=${t.tabindex}
                  aria-haspopup=${t["aria-haspopup"]}
                  aria-expanded=${t["aria-expanded"]}
                  aria-controls=${t["aria-controls"]}
                  aria-autocomplete=${t["aria-autocomplete"]??y}
                  aria-activedescendant=${t["aria-activedescendant"]??y}
                  aria-label=${t["aria-label"]??y}
                  .value=${this.inputValue}
                  placeholder=${this.placeholder}
                  part="input"
                  @input=${this.handleInputChange}
                  @focus=${this.handleInputFocus}
                  @click=${this.handleInputClick}
                  @keydown=${this.handleKeyDown}
                />
              `}
          ${this.renderClearButton()}
        </div>

        <div
          id=${s.id}
          role=${s.role}
          tabindex=${s.tabindex}
          aria-label=${s["aria-label"]??y}
          aria-multiselectable=${s["aria-multiselectable"]??y}
          ?hidden=${!this.open}
          part="listbox"
        >
          ${a?this.renderListboxContent():q`<slot @slotchange=${this.handleSlotChange}></slot>`}
        </div>
      </div>
    `}}class ft extends ve{static elementName="cv-menu-item";static get properties(){return{value:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0},selected:{type:Boolean,reflect:!0},type:{type:String,reflect:!0},checked:{type:Boolean,reflect:!0},label:{type:String,reflect:!0},hasSubmenu:{type:Boolean,reflect:!0,attribute:"has-submenu"}}}constructor(){super(),this.value="",this.disabled=!1,this.active=!1,this.selected=!1,this.type="normal",this.checked=!1,this.label="",this.hasSubmenu=!1}static styles=[Q`
      :host {
        display: block;
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      .item {
        display: flex;
        align-items: center;
        gap: var(--cv-menu-item-gap, var(--cv-space-2, 8px));
        padding: var(--cv-menu-item-padding-block, var(--cv-space-2, 8px)) var(--cv-menu-item-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-menu-item-border-radius, var(--cv-radius-sm, 6px));
        color: var(--cv-color-text, #e8ecf6);
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([active]) .item {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 24%, transparent);
      }

      :host([selected]) .item {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 32%, transparent);
      }

      :host([disabled]) .item {
        opacity: 0.5;
      }

      :host(:focus-visible) .item {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='label'] {
        flex: 1;
      }

      [part='checkmark'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 1em;
        block-size: 1em;
      }

      [part='prefix'],
      [part='suffix'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      [part='submenu-icon'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-inline-start: auto;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}handleSubmenuSlotChange(e){const s=e.target.assignedElements();this.hasSubmenu=s.length>0}render(){const e=this.type==="checkbox"||this.type==="radio";return q`
      <div class="item" part="base">
        ${e?q`<span part="checkmark">${this.checked?"✓":""}</span>`:y}
        <span part="prefix"><slot name="prefix"></slot></span>
        <span part="label"><slot></slot></span>
        <span part="suffix"><slot name="suffix"></slot></span>
        ${this.hasSubmenu?q`<span part="submenu-icon">\u25B6</span>`:y}
      </div>
      <slot name="submenu" @slotchange=${this.handleSubmenuSlotChange}></slot>
    `}}const Xn=new Set(["ArrowUp","ArrowDown","Home","End","Enter"," ","Spacebar","Escape","Tab"]);let Zn=0;class Qn extends de{static elementName="cv-context-menu";static get properties(){return{value:{type:String,reflect:!0},open:{type:Boolean,reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},closeOnSelect:{type:Boolean,attribute:"close-on-select",reflect:!0},closeOnOutsidePointer:{type:Boolean,attribute:"close-on-outside-pointer",reflect:!0},anchorX:{type:Number,attribute:"anchor-x",reflect:!0},anchorY:{type:Number,attribute:"anchor-y",reflect:!0}}}idBase=`cv-context-menu-${++Zn}`;itemRecords=[];itemListeners=new WeakMap;model;_suppressActiveUntilNav=!1;_valueAppliedByInteraction=!1;constructor(){super(),this.value="",this.open=!1,this.ariaLabel="",this.closeOnSelect=!0,this.closeOnOutsidePointer=!0,this.anchorX=0,this.anchorY=0}static styles=[Q`
      :host {
        display: block;
      }

      [part='target'] {
        display: block;
        min-inline-size: 1px;
        min-block-size: 1px;
        outline: none;
      }

      [part='target']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      [part='menu'] {
        position: fixed;
        inset-inline-start: var(--cv-context-menu-x, 0px);
        inset-block-start: var(--cv-context-menu-y, 0px);
        z-index: var(--cv-context-menu-z-index, 80);
        min-inline-size: var(--cv-context-menu-min-inline-size, 180px);
        display: grid;
        gap: var(--cv-context-menu-gap, var(--cv-space-1, 4px));
        padding: var(--cv-context-menu-padding, var(--cv-space-1, 4px));
        border-radius: var(--cv-context-menu-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        box-shadow: var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24));
      }

      [part='menu'][hidden] {
        display: none;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.model||this.rebuildModelFromSlot(!1,!1),this.syncOutsidePointerListener()}disconnectedCallback(){super.disconnectedCallback(),this.detachItemListeners(),this.syncOutsidePointerListener(!0)}willUpdate(e){if(super.willUpdate(e),e.has("ariaLabel")||e.has("closeOnSelect")||e.has("closeOnOutsidePointer")){this.rebuildModelFromSlot(!0,!1);return}if(this.model){if(e.has("open")&&this.model.state.isOpen()!==this.open){const t=this.captureState();this.open?this.model.actions.openAt(this.anchorX,this.anchorY):this.model.actions.close(),this.applyInteractionResult(t)}if(e.has("value")){if(this._valueAppliedByInteraction){this._valueAppliedByInteraction=!1;return}const t=this.value.trim();this.value!==t&&(this.value=t);const s=e.get("value")?.trim()||null;if(t.length>0&&t!==(s??"")){const a=this.captureState();a.value=s;const r=this.model.state.isOpen();this.model.actions.select(t),r&&!this.model.state.isOpen()&&this.model.actions.openAt(a.anchorX,a.anchorY),this.applyInteractionResult(a,t)}}}}updated(e){super.updated(e),this.syncOutsidePointerListener(),!e.has("open")&&!e.has("value")&&this.syncItemElements()}openAt(e,t){if(!this.model)return;const s=this.captureState();this.model.actions.openAt(e,t),this.applyInteractionResult(s)}close(){if(!this.model)return;const e=this.captureState();this.model.actions.close(),this.applyInteractionResult(e)}getItemElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===ft.elementName)}ensureItemValue(e,t){const s=e.value?.trim();if(s)return s;const a=`item-${t+1}`;return e.value=a,a}rebuildModelFromSlot(e,t=!0){const s=this.getItemElements(),a=e?this.captureState():{value:this.value.trim()||null,activeId:null,open:this.open,anchorX:this.anchorX,anchorY:this.anchorY};this.detachItemListeners(),this.itemRecords=s.map((n,l)=>{const d=this.ensureItemValue(n,l),u=n.textContent?.trim()||d;return{id:d,label:u,disabled:n.disabled,element:n}});const r=new Set(this.itemRecords.filter(n=>!n.disabled).map(n=>n.id)),o=a.value&&r.has(a.value)?a.value:null;if(this.model=tn({idBase:this.idBase,items:this.itemRecords.map(n=>({id:n.id,label:n.label,disabled:n.disabled})),ariaLabel:this.ariaLabel||void 0,closeOnSelect:this.closeOnSelect,closeOnOutsidePointer:this.closeOnOutsidePointer}),a.open&&(this.model.actions.openAt(a.anchorX,a.anchorY),a.activeId)){const n=this.itemRecords[0]?.id===a.activeId?"Home":"End";this.model.actions.handleKeyDown({key:n})}if(o){const n=this.model.state.isOpen();this.model.actions.select(o),n&&!this.model.state.isOpen()&&this.model.actions.openAt(a.anchorX,a.anchorY)}this.attachItemListeners(),this.syncItemElements(),this.value=o??"",this.open=this.model.state.isOpen(),this.anchorX=this.model.state.anchorX(),this.anchorY=this.model.state.anchorY(),t&&this.requestUpdate()}detachItemListeners(){for(const e of this.itemRecords){const t=this.itemListeners.get(e.element);t&&(e.element.removeEventListener("click",t.click),this.itemListeners.delete(e.element))}}attachItemListeners(){if(this.model)for(const e of this.itemRecords){const t=s=>{s.preventDefault(),this.handleItemClick(e.id)};e.element.addEventListener("click",t),this.itemListeners.set(e.element,{click:t})}}syncItemElements(){if(this.model)for(const e of this.itemRecords){const t=this.model.contracts.getItemProps(e.id);e.element.id=t.id,e.element.setAttribute("role",t.role),e.element.setAttribute("tabindex",t.tabindex),t["aria-disabled"]?e.element.setAttribute("aria-disabled",t["aria-disabled"]):e.element.removeAttribute("aria-disabled");const s=this._suppressActiveUntilNav?!1:t["data-active"]==="true";e.element.setAttribute("data-active",s?"true":"false"),e.element.active=s,e.element.selected=this.value===e.id,e.element.disabled=t["aria-disabled"]==="true",e.element.hidden=!this.open}}captureState(){return{value:this.value.trim()||null,activeId:this.model?.state.activeId()??null,open:this.model?.state.isOpen()??this.open,anchorX:this.model?.state.anchorX()??this.anchorX,anchorY:this.model?.state.anchorY()??this.anchorY,openedBy:this.model?.state.openedBy()??null,restoreTargetId:this.model?.state.restoreTargetId()??null}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}focusActiveItem(){if(!this.model||!this.open)return;const e=this.model.state.activeId();if(!e)return;this.itemRecords.find(s=>s.id===e)?.element.focus()}applyInteractionResult(e,t){if(!this.model)return;const s=this.captureState(),a=t===void 0?e.value:t,r=this.value;this.value=a??"",this.value!==r&&(this._valueAppliedByInteraction=!0),this.open=s.open,this.anchorX=s.anchorX,this.anchorY=s.anchorY,this.syncItemElements();const o=e.value!==a,n=e.activeId!==s.activeId,l=e.open!==s.open,d=e.anchorX!==s.anchorX||e.anchorY!==s.anchorY;if(o||n||l||d){const u={value:a,activeId:s.activeId,open:s.open,anchorX:s.anchorX,anchorY:s.anchorY,openedBy:s.openedBy};this.dispatchInput(u),o&&this.dispatchChange(u)}l&&s.open&&(this._suppressActiveUntilNav=!0),(l||n)&&this.focusActiveItem(),!s.open&&s.restoreTargetId&&e.restoreTargetId!==s.restoreTargetId&&this.shadowRoot?.querySelector(`[id="${s.restoreTargetId}"]`)?.focus()}syncOutsidePointerListener(e=!1){!e&&this.open?document.addEventListener("pointerdown",this.handleDocumentPointerDown):document.removeEventListener("pointerdown",this.handleDocumentPointerDown)}handleDocumentPointerDown=e=>{if(!this.model||!this.model.state.isOpen()||e.composedPath().includes(this))return;const s=this.captureState();this.model.actions.handleOutsidePointer(),this.applyInteractionResult(s)};handleTargetContextMenu(e){if(!this.model)return;const t=this.captureState();this.model.contracts.getTargetProps().onContextMenu({clientX:e.clientX,clientY:e.clientY,preventDefault:()=>e.preventDefault()}),this.applyInteractionResult(t)}handleTargetKeyDown(e){if(!this.model)return;const t=e.key==="ContextMenu",s=e.key==="F10"&&e.shiftKey;(t||s)&&e.preventDefault();const a=this.captureState();this.model.contracts.getTargetProps().onKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(a)}handleMenuKeyDown(e){if(!this.model)return;Xn.has(e.key)&&e.preventDefault();const t=this.captureState(),s=e.key==="Enter"||e.key===" "||e.key==="Spacebar",a=e.key==="ArrowDown"||e.key==="ArrowUp"||e.key==="Home"||e.key==="End";if(this._suppressActiveUntilNav&&a){this._suppressActiveUntilNav=!1;const o=e.key==="ArrowDown"||e.key==="Home"?"Home":"End";this.model.actions.handleKeyDown({key:o,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(t);return}if((a||s)&&(this._suppressActiveUntilNav=!1),(e.key===" "||e.key==="Spacebar")&&this.model.state.activeId()){const o=this.model.state.activeId();this.model.actions.select(o),this.applyInteractionResult(t,o);return}const r=e.key==="Enter"?this.model.state.activeId():void 0;this.model.actions.handleKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(t,r)}handleItemClick(e){if(!this.model)return;const t=this.itemRecords.find(a=>a.id===e);if(!t||t.disabled)return;const s=this.captureState();this.model.contracts.getItemProps(e).onClick(),this.applyInteractionResult(s,e)}handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}render(){const e=this.model?.contracts.getTargetProps()??{id:`${this.idBase}-target`},t=this.model?.contracts.getMenuProps()??{id:`${this.idBase}-menu`,role:"menu",tabindex:"-1",hidden:!this.open,"aria-label":this.ariaLabel||void 0,"data-anchor-x":String(this.anchorX),"data-anchor-y":String(this.anchorY)};return q`
      <div
        id=${e.id}
        tabindex="0"
        part="target"
        @contextmenu=${this.handleTargetContextMenu}
        @keydown=${this.handleTargetKeyDown}
      >
        <slot name="target"></slot>
      </div>

      <div
        id=${t.id}
        role=${t.role}
        tabindex=${t.tabindex}
        aria-label=${t["aria-label"]??y}
        data-anchor-x=${t["data-anchor-x"]}
        data-anchor-y=${t["data-anchor-y"]}
        style=${`--cv-context-menu-x:${this.anchorX}px; --cv-context-menu-y:${this.anchorY}px;`}
        ?hidden=${t.hidden}
        part="menu"
        @keydown=${this.handleMenuKeyDown}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `}}let Jn=0;class el extends de{static elementName="cv-disclosure";static get properties(){return{open:{type:Boolean,reflect:!0},disabled:{type:Boolean,reflect:!0},name:{type:String,reflect:!0}}}idBase=`cv-disclosure-${++Jn}`;model;suppressEvents=!1;constructor(){super(),this.open=!1,this.disabled=!1,this.name="",this.model=this.createModel()}static styles=[Q`
      :host {
        display: block;
        --cv-disclosure-duration: var(--cv-duration-fast, 120ms);
        --cv-disclosure-easing: var(--cv-easing-standard, ease);
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-2, 8px);
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        min-block-size: 36px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='trigger-icon'] {
        inline-size: 16px;
        block-size: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--cv-color-text-muted, #9aa6bf);
        transition: transform var(--cv-disclosure-duration) var(--cv-disclosure-easing);
      }

      :host([open]) [part='trigger-icon'] {
        transform: rotate(90deg);
      }

      [part='panel'] {
        padding: var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='panel'][hidden] {
        display: none;
      }

      :host([disabled]) [part='trigger'] {
        cursor: not-allowed;
        opacity: 0.55;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}disconnectedCallback(){super.disconnectedCallback(),this.model.actions.destroy()}willUpdate(e){if(super.willUpdate(e),e.has("disabled")&&this.model.actions.setDisabled(this.disabled),e.has("name")&&this.model.actions.setName(this.name||null),e.has("open")&&this.model.state.isOpen()!==this.open){this.suppressEvents=!0;const t=this.model.state.isDisabled();t&&this.model.actions.setDisabled(!1),this.open?this.model.actions.open():this.model.actions.close(),t&&this.model.actions.setDisabled(!0),this.open=this.model.state.isOpen(),this.suppressEvents=!1}}createModel(){return Bo({idBase:this.idBase,isOpen:this.open,isDisabled:this.disabled,name:this.name||void 0})}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}syncFromModel(e){const t=this.model.state.isOpen();if(this.open=t,this.suppressEvents||e===t)return;const s={open:t};this.dispatchInput(s),this.dispatchChange(s)}syncGroupedSiblings(){if(!this.name)return;const e=document.querySelectorAll(`cv-disclosure[name="${this.name}"]`);for(const t of e){if(t===this)continue;const s=t.model.state.isOpen();t.open!==s&&(t.open=s)}}show(){this.suppressEvents=!0,this.model.actions.open(),this.open=this.model.state.isOpen(),this.suppressEvents=!1}hide(){this.suppressEvents=!0,this.model.actions.close(),this.open=this.model.state.isOpen(),this.suppressEvents=!1}handleTriggerClick(){const e=this.model.state.isOpen();this.model.contracts.getTriggerProps().onClick(),this.syncFromModel(e),this.syncGroupedSiblings()}handleTriggerKeyDown(e){const t=this.model.state.isOpen();this.model.contracts.getTriggerProps().onKeyDown(e),this.syncFromModel(t),this.syncGroupedSiblings()}render(){const e=this.model.contracts.getTriggerProps(),t=this.model.contracts.getPanelProps();return q`
      <div part="base">
        <div
          id=${e.id}
          role=${e.role}
          tabindex=${e.tabindex}
          aria-expanded=${e["aria-expanded"]}
          aria-controls=${e["aria-controls"]}
          aria-disabled=${e["aria-disabled"]??y}
          part="trigger"
          @click=${this.handleTriggerClick}
          @keydown=${this.handleTriggerKeyDown}
        >
          <slot name="trigger"></slot>
          <span part="trigger-icon" aria-hidden="true">&#x25B6;</span>
        </div>

        <div
          id=${t.id}
          aria-labelledby=${t["aria-labelledby"]}
          ?hidden=${t.hidden}
          part="panel"
        >
          <slot></slot>
        </div>
      </div>
    `}}let tl=0;class sl extends Le{static elementName="cv-date-picker";static get properties(){return{name:{type:String},value:{type:String,reflect:!0},open:{type:Boolean,reflect:!0},disabled:{type:Boolean,reflect:!0},readonly:{type:Boolean,reflect:!0},required:{type:Boolean,reflect:!0},placeholder:{type:String},size:{type:String,reflect:!0},locale:{type:String},timeZone:{type:String,attribute:"time-zone",reflect:!0},min:{type:String},max:{type:String},minuteStep:{type:Number,attribute:"minute-step"},hourCycle:{type:Number,attribute:"hour-cycle"},closeOnEscape:{type:Boolean,attribute:"close-on-escape",reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},inputInvalid:{type:Boolean,attribute:"input-invalid",reflect:!0},hasValue:{type:Boolean,attribute:"has-value",reflect:!0}}}idBase=`cv-date-picker-${++tl}`;model;pendingCommitSource="input";documentPointerDownListener;defaultValue="";didCaptureDefaultValue=!1;constructor(){super(),this.name="",this.value="",this.open=!1,this.disabled=!1,this.readonly=!1,this.required=!1,this.placeholder="Select date and time",this.size="medium",this.locale="en-US",this.timeZone="local",this.min="",this.max="",this.minuteStep=1,this.hourCycle=24,this.closeOnEscape=!0,this.ariaLabel="",this.inputInvalid=!1,this.hasValue=!1,this.model=this.createModel(),this.documentPointerDownListener=this.handleDocumentPointerDown.bind(this),this.syncHostStateFromModel()}static styles=[Q`
      :host {
        display: inline-block;
        inline-size: var(--cv-date-picker-min-width, 260px);
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-2, 8px);
      }

      [part='input-wrap'] {
        display: flex;
        align-items: center;
        gap: var(--cv-space-2, 8px);
        min-block-size: var(--cv-date-picker-input-min-height, 36px);
        padding: var(--cv-date-picker-input-padding-block, var(--cv-space-2, 8px))
          var(--cv-date-picker-input-padding-inline, var(--cv-space-3, 12px));
        border: 1px solid var(--cv-color-border, #2a3245);
        border-radius: var(--cv-date-picker-border-radius, var(--cv-radius-md, 10px));
        background: var(--cv-color-surface, #141923);
      }

      [part='prefix'],
      [part='suffix'] {
        display: inline-flex;
        align-items: center;
      }

      [part='label'] {
        flex: 1;
        min-inline-size: 0;
        display: inline-flex;
      }

      [part='input'] {
        inline-size: 100%;
        border: none;
        outline: none;
        background: transparent;
        color: var(--cv-color-text, #e8ecf6);
        font: inherit;
      }

      [part='clear-button'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--cv-color-text-muted, #9aa6bf);
        cursor: pointer;
        padding: 0;
      }

      [part='dialog'] {
        inline-size: var(--cv-date-picker-dialog-width, min(560px, calc(100vw - 32px)));
        display: grid;
        gap: var(--cv-space-2, 8px);
        padding: var(--cv-space-3, 12px);
        border-radius: var(--cv-date-picker-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
      }

      [part='dialog'][hidden] {
        display: none;
      }

      [part='calendar-shell'] {
        display: grid;
        grid-template-columns: auto auto 1fr auto auto;
        align-items: center;
        gap: var(--cv-space-2, 8px);
      }

      [part='month-label'] {
        justify-self: center;
      }

      [part='month-nav-button'],
      [part='year-nav-button'],
      [part='apply-button'],
      [part='cancel-button'] {
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        border-radius: var(--cv-radius-sm, 6px);
        cursor: pointer;
      }

      [part='calendar-grid'] {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: var(--cv-date-picker-day-gap, var(--cv-space-1, 4px));
      }

      [part='calendar-day'] {
        min-block-size: var(--cv-date-picker-day-size, 34px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: transparent;
        color: var(--cv-color-text, #e8ecf6);
        border-radius: var(--cv-radius-sm, 6px);
        cursor: pointer;
      }

      [part='calendar-day'][data-month='prev'],
      [part='calendar-day'][data-month='next'] {
        color: var(--cv-color-text-muted, #9aa6bf);
      }

      [part='calendar-day'][aria-selected='true'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, transparent);
      }

      [part='time-row'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-space-2, 8px);
      }

      [part='hour-input'],
      [part='minute-input'] {
        inline-size: 3.5ch;
        text-align: center;
      }

      [part='actions'] {
        display: inline-flex;
        justify-content: flex-end;
        gap: var(--cv-date-picker-button-gap, var(--cv-space-2, 8px));
      }

      [part='dialog-caption'] {
        color: var(--cv-color-text-muted, #9aa6bf);
        font-size: 0.85em;
      }

      :host([size='small']) {
        --cv-date-picker-input-min-height: 30px;
        --cv-date-picker-input-padding-inline: var(--cv-space-2, 8px);
        --cv-date-picker-input-padding-block: var(--cv-space-1, 4px);
      }

      :host([size='large']) {
        --cv-date-picker-input-min-height: 42px;
        --cv-date-picker-input-padding-inline: var(--cv-space-4, 16px);
        --cv-date-picker-input-padding-block: var(--cv-space-2, 8px);
      }

      :host([disabled]) {
        opacity: 0.55;
      }

      :host([disabled]) [part='input-wrap'],
      :host([disabled]) [part='dialog'] {
        pointer-events: none;
      }

      :host([input-invalid]) [part='input-wrap'] {
        border-color: var(--cv-color-danger, #ff6b6b);
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.syncOutsidePointerListener(),this.didCaptureDefaultValue||(this.defaultValue=this.value,this.didCaptureDefaultValue=!0)}disconnectedCallback(){super.disconnectedCallback(),this.syncOutsidePointerListener(!0)}willUpdate(e){if(super.willUpdate(e),e.has("ariaLabel")||e.has("closeOnEscape")){this.rebuildModel();return}if(e.has("disabled")&&this.model.state.disabled()!==this.disabled&&this.model.actions.setDisabled(this.isEffectivelyDisabled()),e.has("readonly")&&this.model.state.readonly()!==this.readonly&&this.model.actions.setReadonly(this.readonly),e.has("required")&&this.model.state.required()!==this.required&&this.model.actions.setRequired(this.required),e.has("placeholder")&&this.model.state.placeholder()!==this.placeholder&&this.model.actions.setPlaceholder(this.placeholder),e.has("locale")&&this.model.state.locale()!==this.locale&&this.model.actions.setLocale(this.locale),e.has("timeZone")){const t=this.timeZone==="utc"?"utc":"local";this.model.state.timeZone()!==t&&this.model.actions.setTimeZone(t)}e.has("min")&&this.model.state.min()!==this.toNullable(this.min)&&this.model.actions.setMin(this.toNullable(this.min)),e.has("max")&&this.model.state.max()!==this.toNullable(this.max)&&this.model.actions.setMax(this.toNullable(this.max)),e.has("minuteStep")&&this.model.state.minuteStep()!==this.minuteStep&&this.model.actions.setMinuteStep(this.minuteStep),e.has("hourCycle")&&this.model.state.hourCycle()!==this.hourCycle&&this.model.actions.setHourCycle(this.hourCycle),e.has("value")&&this.syncModelFromExternalValue(),e.has("open")&&this.model.state.isOpen()!==this.open&&(this.open?this.model.actions.open():this.model.actions.close()),this.syncHostStateFromModel(),this.syncFormAssociatedState()}updated(e){super.updated(e),this.syncOutsidePointerListener(),e.has("size")&&this.requestUpdate()}createModel(e=this.value){return to({idBase:this.idBase,value:this.toNullable(e),required:this.required,disabled:this.isEffectivelyDisabled(),readonly:this.readonly,placeholder:this.placeholder,locale:this.locale,timeZone:this.timeZone==="utc"?"utc":"local",min:this.toNullable(this.min),max:this.toNullable(this.max),minuteStep:this.minuteStep,hourCycle:this.hourCycle,closeOnEscape:this.closeOnEscape,ariaLabel:this.ariaLabel||void 0,onInput:t=>{this.handleHeadlessInput(t)},onCommit:t=>{this.handleHeadlessCommit(t)},onClear:()=>{this.syncHostStateFromModel()}})}rebuildModel(){const e=this.model.state.committedValue()??this.value,t=this.model.state.isOpen();this.model=this.createModel(e),t&&this.model.actions.open(),this.syncHostStateFromModel()}toNullable(e){const t=e.trim();return t.length>0?t:null}syncModelFromExternalValue(){const e=this.value.trim(),t=this.model.state.committedValue()??"";if(e!==t){if(e.length===0){this.pendingCommitSource="input",this.model.actions.clear();return}this.model.actions.setInputValue(e),this.pendingCommitSource="input",this.model.actions.commitInput()}}syncHostStateFromModel(){const e=this.model.state.committedValue()??"",t=this.model.state.isOpen(),s=this.model.state.inputInvalid(),a=this.model.state.hasCommittedSelection();this.value!==e&&(this.value=e),this.open!==t&&(this.open=t),this.inputInvalid!==s&&(this.inputInvalid=s),this.hasValue!==a&&(this.hasValue=a),this.syncFormAssociatedState()}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}handleHeadlessInput(e){this.dispatchInput({value:this.model.state.committedValue()??"",inputValue:e,open:this.model.state.isOpen(),invalid:this.model.state.inputInvalid()}),this.syncHostStateFromModel()}handleHeadlessCommit(e){const t=this.value,s=e??"",a=this.pendingCommitSource;this.pendingCommitSource="input",this.syncHostStateFromModel(),t!==s&&this.dispatchChange({value:s,previousValue:t,source:a})}syncOutsidePointerListener(e=!1){!e&&this.model.state.isOpen()?document.addEventListener("pointerdown",this.documentPointerDownListener):document.removeEventListener("pointerdown",this.documentPointerDownListener)}handleDocumentPointerDown(e){!this.model.state.isOpen()||e.composedPath().includes(this)||(this.model.contracts.getDialogProps().onPointerDownOutside(),this.syncHostStateFromModel())}handleInputEvent(e){const t=e.currentTarget.value;this.model.contracts.getInputProps().onInput(t),this.syncHostStateFromModel()}handleInputKeyDown(e){e.key==="Enter"&&(this.pendingCommitSource="input"),this.model.contracts.getInputProps().onKeyDown(e),this.syncHostStateFromModel()}handleInputFocus(){this.model.contracts.getInputProps().onFocus(),this.syncHostStateFromModel()}handleInputBlur(){this.model.contracts.getInputProps().onBlur(),this.syncHostStateFromModel()}handleDialogKeyDown(e){this.model.contracts.getDialogProps().onKeyDown(e),this.syncHostStateFromModel()}handleGridKeyDown(e){e.key==="Enter"&&e.ctrlKey&&(this.pendingCommitSource="dialog"),this.model.contracts.getCalendarGridProps().onKeyDown(e),this.syncHostStateFromModel()}handleDayClick(e){const s=e.currentTarget.getAttribute("data-date");s&&(this.model.contracts.getCalendarDayProps(s).onClick(),this.syncHostStateFromModel())}handleDayMouseEnter(e){const s=e.currentTarget.getAttribute("data-date");s&&(this.model.contracts.getCalendarDayProps(s).onMouseEnter(),this.syncHostStateFromModel())}handleMonthPrevClick(){this.model.contracts.getMonthNavButtonProps("prev").onClick(),this.syncHostStateFromModel()}handleMonthNextClick(){this.model.contracts.getMonthNavButtonProps("next").onClick(),this.syncHostStateFromModel()}handleYearPrevClick(){this.model.contracts.getYearNavButtonProps("prev").onClick(),this.syncHostStateFromModel()}handleYearNextClick(){this.model.contracts.getYearNavButtonProps("next").onClick(),this.syncHostStateFromModel()}handleTimeInput(e){const t=e.currentTarget;t.getAttribute("data-segment")==="hour"?this.model.contracts.getHourInputProps().onInput(t.value):this.model.contracts.getMinuteInputProps().onInput(t.value),this.syncHostStateFromModel()}handleTimeKeyDown(e){e.key==="Enter"&&(this.pendingCommitSource="dialog"),e.currentTarget.getAttribute("data-segment")==="hour"?this.model.contracts.getHourInputProps().onKeyDown(e):this.model.contracts.getMinuteInputProps().onKeyDown(e),this.syncHostStateFromModel()}handleApplyClick(){this.pendingCommitSource="dialog",this.model.contracts.getApplyButtonProps().onClick(),this.syncHostStateFromModel()}handleCancelClick(){this.model.contracts.getCancelButtonProps().onClick(),this.syncHostStateFromModel()}handleClearClick(){this.pendingCommitSource="input",this.model.contracts.getClearButtonProps().onClick(),this.syncHostStateFromModel()}onFormDisabledChanged(e){this.model.actions.setDisabled(this.isEffectivelyDisabled())}onFormReset(){this.pendingCommitSource="input",this.value=this.defaultValue,this.syncModelFromExternalValue(),this.syncHostStateFromModel()}onFormStateRestore(e){typeof e=="string"&&(this.pendingCommitSource="input",this.value=e,this.syncModelFromExternalValue(),this.syncHostStateFromModel())}isFormAssociatedDisabled(){return this.isEffectivelyDisabled()}getFormAssociatedValue(){return this.value||null}getFormAssociatedValidity(){return this.inputInvalid?{flags:{badInput:!0},message:"Please enter a valid date and time."}:this.required&&this.value.length===0?{flags:{valueMissing:!0},message:"Please fill out this field."}:{flags:{}}}isEffectivelyDisabled(){return this.disabled||this.formDisabled}formatMonthLabel(e,t){const s=new Date(Date.UTC(e,t-1,1,12,0,0,0));try{return new Intl.DateTimeFormat(this.locale,{month:"long",year:"numeric",timeZone:"UTC"}).format(s)}catch{return`${e}-${String(t).padStart(2,"0")}`}}render(){const e=this.model.contracts.getInputProps(),t=this.model.contracts.getDialogProps(),s=this.model.contracts.getCalendarGridProps(),a=this.model.contracts.getMonthNavButtonProps("prev"),r=this.model.contracts.getMonthNavButtonProps("next"),o=this.model.contracts.getYearNavButtonProps("prev"),n=this.model.contracts.getYearNavButtonProps("next"),l=this.model.contracts.getHourInputProps(),d=this.model.contracts.getMinuteInputProps(),u=this.model.contracts.getApplyButtonProps(),h=this.model.contracts.getCancelButtonProps(),p=this.model.contracts.getClearButtonProps(),v=this.model.state.displayedYear(),g=this.model.state.displayedMonth(),f=this.formatMonthLabel(v,g),x=this.model.contracts.getVisibleDays();return q`
      <div part="base">
        <div part="input-wrap">
          <span part="prefix"><slot name="prefix"></slot></span>
          <span part="label">
            <input
              part="input"
              id=${e.id}
              role=${e.role}
              tabindex=${e.tabindex}
              autocomplete=${e.autocomplete}
              .value=${e.value}
              ?disabled=${e.disabled}
              ?readonly=${!!e.readonly}
              ?required=${!!e.required}
              name=${this.name||y}
              placeholder=${e.placeholder}
              aria-haspopup=${e["aria-haspopup"]}
              aria-expanded=${e["aria-expanded"]}
              aria-controls=${e["aria-controls"]}
              aria-activedescendant=${e["aria-activedescendant"]??y}
              aria-invalid=${e["aria-invalid"]??y}
              aria-required=${e.required?"true":y}
              aria-label=${e["aria-label"]??y}
              @input=${this.handleInputEvent}
              @keydown=${this.handleInputKeyDown}
              @focus=${this.handleInputFocus}
              @blur=${this.handleInputBlur}
            />
          </span>
          <span part="suffix"><slot name="suffix"></slot></span>
          <button
            part="clear-button"
            id=${p.id}
            role=${p.role}
            tabindex=${p.tabindex}
            aria-label=${p["aria-label"]}
            ?disabled=${p.disabled}
            ?hidden=${!this.hasValue}
            @click=${this.handleClearClick}
          >
            <slot name="clear-icon">&times;</slot>
          </button>
        </div>

        <div
          part="dialog"
          id=${t.id}
          role=${t.role}
          tabindex=${t.tabindex}
          ?hidden=${t.hidden}
          aria-modal=${t["aria-modal"]}
          aria-label=${t["aria-label"]}
          @keydown=${this.handleDialogKeyDown}
        >
          <div part="calendar-shell">
            <button
              part="year-nav-button"
              id=${o.id}
              role=${o.role}
              tabindex=${o.tabindex}
              aria-label=${o["aria-label"]}
              data-dir="prev"
              @click=${this.handleYearPrevClick}
            >
              <slot name="year-prev">&laquo;</slot>
            </button>
            <button
              part="month-nav-button"
              id=${a.id}
              role=${a.role}
              tabindex=${a.tabindex}
              aria-label=${a["aria-label"]}
              data-dir="prev"
              @click=${this.handleMonthPrevClick}
            >
              <slot name="month-prev">&lsaquo;</slot>
            </button>
            <span part="month-label">${f}</span>
            <button
              part="month-nav-button"
              id=${r.id}
              role=${r.role}
              tabindex=${r.tabindex}
              aria-label=${r["aria-label"]}
              data-dir="next"
              @click=${this.handleMonthNextClick}
            >
              <slot name="month-next">&rsaquo;</slot>
            </button>
            <button
              part="year-nav-button"
              id=${n.id}
              role=${n.role}
              tabindex=${n.tabindex}
              aria-label=${n["aria-label"]}
              data-dir="next"
              @click=${this.handleYearNextClick}
            >
              <slot name="year-next">&raquo;</slot>
            </button>
          </div>

          <div
            part="calendar-grid"
            id=${s.id}
            role=${s.role}
            tabindex=${s.tabindex}
            aria-label=${s["aria-label"]}
            @keydown=${this.handleGridKeyDown}
          >
            ${x.map(m=>{const I=this.model.contracts.getCalendarDayProps(m.date),$=Number(m.date.slice(8,10));return q`
                <button
                  part="calendar-day"
                  id=${I.id}
                  role=${I.role}
                  tabindex=${I.tabindex}
                  aria-selected=${I["aria-selected"]}
                  aria-disabled=${I["aria-disabled"]??y}
                  aria-current=${I["aria-current"]??y}
                  data-date=${I["data-date"]}
                  data-month=${m.month}
                  ?disabled=${m.disabled}
                  @click=${this.handleDayClick}
                  @mouseenter=${this.handleDayMouseEnter}
                >
                  ${$}
                </button>
              `})}
          </div>

          <div part="time-row">
            <input
              part="hour-input"
              id=${l.id}
              type=${l.type}
              inputmode=${l.inputmode}
              aria-label=${l["aria-label"]}
              .value=${l.value}
              minlength=${l.minlength}
              maxlength=${l.maxlength}
              ?disabled=${l.disabled}
              ?readonly=${l.readonly}
              data-segment="hour"
              @input=${this.handleTimeInput}
              @keydown=${this.handleTimeKeyDown}
            />
            <span part="time-separator">:</span>
            <input
              part="minute-input"
              id=${d.id}
              type=${d.type}
              inputmode=${d.inputmode}
              aria-label=${d["aria-label"]}
              .value=${d.value}
              minlength=${d.minlength}
              maxlength=${d.maxlength}
              ?disabled=${d.disabled}
              ?readonly=${d.readonly}
              data-segment="minute"
              @input=${this.handleTimeInput}
              @keydown=${this.handleTimeKeyDown}
            />
          </div>

          <div part="actions">
            <button
              part="apply-button"
              id=${u.id}
              role=${u.role}
              tabindex=${u.tabindex}
              aria-label=${u["aria-label"]}
              ?disabled=${u.disabled}
              @click=${this.handleApplyClick}
            >
              <slot name="apply-label">Apply</slot>
            </button>
            <button
              part="cancel-button"
              id=${h.id}
              role=${h.role}
              tabindex=${h.tabindex}
              aria-label=${h["aria-label"]}
              ?disabled=${h.disabled}
              @click=${this.handleCancelClick}
            >
              <slot name="cancel-label">Cancel</slot>
            </button>
          </div>

          <span part="dialog-caption">
            <slot name="dialog-caption">Use calendar keys and Enter to apply.</slot>
          </span>
        </div>
      </div>
    `}}let il=0;class al extends de{static elementName="cv-dialog";static get properties(){return{open:{type:Boolean,reflect:!0},modal:{type:Boolean,reflect:!0},type:{type:String,reflect:!0},closeOnEscape:{type:Boolean,attribute:"close-on-escape",reflect:!0},closeOnOutsidePointer:{type:Boolean,attribute:"close-on-outside-pointer",reflect:!0},closeOnOutsideFocus:{type:Boolean,attribute:"close-on-outside-focus",reflect:!0},initialFocusId:{type:String,attribute:"initial-focus-id"},noHeader:{type:Boolean,attribute:"no-header",reflect:!0},closable:{type:Boolean}}}idBase=`cv-dialog-${++il}`;model;lockScrollApplied=!1;previousBodyOverflow="";suppressLifecycleFromUpdate=!1;lifecycleToken=0;constructor(){super(),this.open=!1,this.modal=!0,this.type="dialog",this.closeOnEscape=!0,this.closeOnOutsidePointer=!0,this.closeOnOutsideFocus=!0,this.initialFocusId="",this.noHeader=!1,this.closable=!0,this.model=this.createModel()}static styles=[Q`
      :host {
        display: inline-block;
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 36px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='overlay'] {
        position: fixed;
        inset: 0;
        z-index: var(--cv-dialog-z-index, 40);
        display: grid;
        place-items: center;
        background: var(--cv-dialog-overlay-color, color-mix(in oklab, black 56%, transparent));
        padding: var(--cv-space-4, 16px);
      }

      [part='overlay'][hidden] {
        display: none;
      }

      [part='content'] {
        box-sizing: border-box;
        inline-size: var(--cv-dialog-width, min(560px, calc(100vw - 32px)));
        max-block-size: var(--cv-dialog-max-height, calc(100dvh - 32px));
        overflow: auto;
        display: grid;
        gap: var(--cv-space-3, 12px);
        padding: var(--cv-space-4, 16px);
        border-radius: var(--cv-dialog-border-radius, var(--cv-radius-lg, 14px));
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='content']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='header'] {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        row-gap: var(--cv-space-1, 4px);
        column-gap: var(--cv-space-3, 12px);
        align-items: start;
      }

      [part='title'] {
        grid-column: 1;
        margin: 0;
        font-size: var(--cv-dialog-title-font-size, 1.05rem);
        font-weight: var(--cv-dialog-title-font-weight, 600);
        line-height: var(--cv-dialog-title-line-height, 1.2);
        min-inline-size: 0;
      }

      [part='description'] {
        grid-column: 1;
        margin: 0;
        color: var(--cv-color-text-muted, #9aa6bf);
        min-inline-size: 0;
      }

      [part='header-close'] {
        grid-column: 2;
        grid-row: 1 / span 2;
        align-self: start;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 28px;
        min-inline-size: 28px;
        padding: 0;
        border-radius: var(--cv-radius-sm, 6px);
        border: none;
        background: transparent;
        color: var(--cv-color-text-muted, #9aa6bf);
        cursor: pointer;
        transition: color 0.15s ease, background 0.15s ease;
      }

      [part='header-close']:hover {
        color: var(--cv-color-text, #e8ecf6);
        background: color-mix(in oklab, var(--cv-color-text, #e8ecf6) 8%, transparent);
      }

      [part='header-close']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      ::slotted([slot='title']) {
        color: var(--cv-color-text, #e8ecf6);
        font-size: var(--cv-dialog-title-font-size, 1.05rem);
        font-weight: var(--cv-dialog-title-font-weight, 600);
        line-height: var(--cv-dialog-title-line-height, 1.2);
      }

      ::slotted([slot='description']) {
        color: var(--cv-color-text-muted, #9aa6bf);
      }

      [part='footer'] {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cv-space-2, 8px);
        justify-content: flex-end;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.syncOutsideFocusListener(),this.syncScrollLock()}disconnectedCallback(){super.disconnectedCallback(),this.syncOutsideFocusListener(!0),this.releaseScrollLock()}willUpdate(e){if(super.willUpdate(e),e.has("modal")||e.has("type")||e.has("closeOnEscape")||e.has("closeOnOutsidePointer")||e.has("closeOnOutsideFocus")||e.has("initialFocusId")){const t=this.model.state.isOpen();this.model=this.createModel(t)}e.has("open")&&this.model.state.isOpen()!==this.open&&(this.open?this.model.actions.open():this.model.actions.close())}updated(e){if(super.updated(e),this.syncOutsideFocusListener(),this.syncScrollLock(),e.has("open")){const t=e.get("open");this.suppressLifecycleFromUpdate?this.suppressLifecycleFromUpdate=!1:t!==void 0&&t!==this.open&&this.dispatchLifecycleTransition(this.open),this.open&&this.focusInitialTarget()}}createModel(e=this.open){return jt({idBase:this.idBase,initialOpen:e,isModal:this.modal,type:this.type,closeOnEscape:this.closeOnEscape,closeOnOutsidePointer:this.closeOnOutsidePointer,closeOnOutsideFocus:this.closeOnOutsideFocus,initialFocusId:this.initialFocusId||void 0})}captureState(){return{open:this.model.state.isOpen(),restoreTargetId:this.model.state.restoreTargetId()}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}dispatchLifecycleEvent(e){this.dispatchEvent(new CustomEvent(e,{bubbles:!0,composed:!0}))}dispatchLifecycleTransition(e){const t=++this.lifecycleToken;this.dispatchLifecycleEvent(e?"cv-show":"cv-hide"),this.updateComplete.then(()=>{this.lifecycleToken===t&&this.dispatchLifecycleEvent(e?"cv-after-show":"cv-after-hide")})}applyInteractionResult(e){const t=this.model.state.isOpen();if(e.open!==t){const a={open:t};this.suppressLifecycleFromUpdate=!0,this.open=t,this.dispatchLifecycleTransition(t),this.dispatchInput(a),this.dispatchChange(a)}else this.open=t;const s=this.model.state.restoreTargetId();s&&e.restoreTargetId!==s&&this.shadowRoot?.querySelector(`[id="${s}"]`)?.focus()}syncOutsideFocusListener(e=!1){!e&&this.open?document.addEventListener("focusin",this.handleDocumentFocusIn):document.removeEventListener("focusin",this.handleDocumentFocusIn)}syncScrollLock(){if(!this.model.state.shouldLockScroll()){this.releaseScrollLock();return}this.lockScrollApplied||(this.previousBodyOverflow=document.body.style.overflow,document.body.style.overflow="hidden",this.lockScrollApplied=!0)}releaseScrollLock(){this.lockScrollApplied&&(document.body.style.overflow=this.previousBodyOverflow,this.lockScrollApplied=!1)}focusInitialTarget(){const t=this.model.contracts.getContentProps()["data-initial-focus"];if(t){const a=this.querySelector(`#${t}`)??this.shadowRoot?.querySelector(`#${t}`);if(a){a.focus();return}}this.shadowRoot?.querySelector('[part="content"]')?.focus()}handleDocumentFocusIn=e=>{if(!this.open||e.composedPath().includes(this))return;const s=this.captureState();this.model.actions.handleOutsideFocus(),this.applyInteractionResult(s)};handleTriggerClick(){const e=this.captureState();this.model.contracts.getTriggerProps().onClick(),this.applyInteractionResult(e)}handleTriggerKeyDown(e){(e.key==="Enter"||e.key===" "||e.key==="Spacebar")&&e.preventDefault();const t=this.captureState();this.model.contracts.getTriggerProps().onKeyDown({key:e.key}),this.applyInteractionResult(t)}handleOverlayPointerDown(e){if(e.target!==e.currentTarget)return;const t=this.captureState();this.model.contracts.getOverlayProps().onPointerDownOutside(),this.applyInteractionResult(t)}handleContentKeyDown(e){e.key==="Escape"&&e.preventDefault();const t=this.captureState();this.model.contracts.getContentProps().onKeyDown({key:e.key}),this.applyInteractionResult(t)}handleHeaderCloseClick(){const e=this.captureState();this.model.contracts.getHeaderCloseButtonProps().onClick(),this.applyInteractionResult(e)}render(){const e=this.model.contracts.getTriggerProps(),t=this.model.contracts.getOverlayProps(),s=this.model.contracts.getContentProps(),a=this.model.contracts.getTitleProps(),r=this.model.contracts.getDescriptionProps(),o=this.model.contracts.getHeaderCloseButtonProps();return q`
      <button
        id=${e.id}
        role=${e.role}
        tabindex=${e.tabindex}
        aria-haspopup=${e["aria-haspopup"]}
        aria-expanded=${e["aria-expanded"]}
        aria-controls=${e["aria-controls"]}
        part="trigger"
        type="button"
        @click=${this.handleTriggerClick}
        @keydown=${this.handleTriggerKeyDown}
      >
        <slot name="trigger">Open dialog</slot>
      </button>

      <div
        id=${t.id}
        data-open=${t["data-open"]}
        ?hidden=${t.hidden}
        part="overlay"
        @mousedown=${this.handleOverlayPointerDown}
      >
        <section
          id=${s.id}
          role=${s.role}
          tabindex=${s.tabindex}
          aria-modal=${s["aria-modal"]}
          aria-labelledby=${s["aria-labelledby"]??y}
          aria-describedby=${s["aria-describedby"]??y}
          data-initial-focus=${s["data-initial-focus"]??y}
          part="content"
          @keydown=${this.handleContentKeyDown}
        >
          <header part="header" ?hidden=${this.noHeader}>
            <h2 id=${a.id} part="title">
              <slot name="title">Dialog</slot>
            </h2>
            <p id=${r.id} part="description">
              <slot name="description"></slot>
            </p>
            ${this.closable?q`
                  <button
                    id=${o.id}
                    role=${o.role}
                    tabindex=${o.tabindex}
                    aria-label=${o["aria-label"]}
                    type="button"
                    part="header-close"
                    @click=${this.handleHeaderCloseClick}
                  >
                    <slot name="header-close"
                      ><svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                      >
                        <line x1="4" y1="4" x2="12" y2="12" />
                        <line x1="12" y1="4" x2="4" y2="12" />
                      </svg></slot
                    >
                  </button>
                `:y}
          </header>

          <div part="body">
            <slot></slot>
          </div>

          <footer part="footer">
            <slot name="footer"></slot>
          </footer>
        </section>
      </div>
    `}}let rl=0;class ol extends de{static elementName="cv-drawer";static get properties(){return{open:{type:Boolean,reflect:!0},modal:{type:Boolean,reflect:!0},placement:{type:String,reflect:!0},type:{type:String,reflect:!0},closeOnEscape:{type:Boolean,attribute:"close-on-escape",reflect:!0},closeOnOutsidePointer:{type:Boolean,attribute:"close-on-outside-pointer",reflect:!0},closeOnOutsideFocus:{type:Boolean,attribute:"close-on-outside-focus",reflect:!0},initialFocusId:{type:String,attribute:"initial-focus-id"},noHeader:{type:Boolean,attribute:"no-header",reflect:!0}}}idBase=`cv-drawer-${++rl}`;model;lockScrollApplied=!1;previousBodyOverflow="";suppressLifecycleFromUpdate=!1;lifecycleToken=0;overlayVisible=!1;renderState="closed";openAnimationFrame=0;closeAnimationTimeout=0;shouldAnimatePresence=!1;constructor(){super(),this.open=!1,this.modal=!0,this.placement="end",this.type="dialog",this.closeOnEscape=!0,this.closeOnOutsidePointer=!0,this.closeOnOutsideFocus=!0,this.initialFocusId="",this.noHeader=!1,this.model=this.createModel(),this.overlayVisible=this.open,this.renderState=this.open?"open":"closed"}static styles=[Q`
      :host {
        display: inline-block;
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 36px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='overlay'] {
        position: fixed;
        inset: 0;
        z-index: var(--cv-drawer-z-index, 40);
        display: flex;
        overflow: clip;
        contain: paint;
        background: var(--cv-drawer-overlay-color, color-mix(in oklab, black 56%, transparent));
        opacity: var(--cv-drawer-overlay-closed-opacity, 1);
        transition: opacity var(--cv-drawer-overlay-transition-duration, 0ms) ease;
      }

      [part='overlay'][hidden] {
        display: none;
      }

      [part='overlay'][data-state='open'] {
        opacity: 1;
      }

      [part='panel'] {
        position: fixed;
        overflow: auto;
        display: grid;
        grid-template-rows: auto 1fr auto;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
        opacity: 0;
        will-change: transform, opacity;
        transition:
          transform var(--cv-drawer-transition-duration, 250ms) ease,
          opacity var(--cv-drawer-transition-duration, 250ms) ease;
      }

      [part='panel']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      /* Placement: start (inline-start edge) */
      [part='panel'][data-placement='start'] {
        inset-block: 0;
        inset-inline-start: 0;
        inline-size: var(--cv-drawer-size, 360px);
        max-inline-size: var(--cv-drawer-max-size, calc(100dvh - 32px));
        border-radius: 0 var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px))
          var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px)) 0;
        transform: translate3d(-100%, 0, 0);
      }

      /* Placement: end (inline-end edge) */
      [part='panel'][data-placement='end'] {
        inset-block: 0;
        inset-inline-end: 0;
        inline-size: var(--cv-drawer-size, 360px);
        max-inline-size: var(--cv-drawer-max-size, calc(100dvh - 32px));
        border-radius: var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px)) 0 0
          var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px));
        transform: translate3d(100%, 0, 0);
      }

      /* Placement: top */
      [part='panel'][data-placement='top'] {
        inset-inline: 0;
        inset-block-start: 0;
        block-size: var(--cv-drawer-size, 360px);
        max-block-size: var(--cv-drawer-max-size, calc(100dvh - 32px));
        border-radius: 0 0 var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px))
          var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px));
        transform: translate3d(0, -100%, 0);
      }

      /* Placement: bottom */
      [part='panel'][data-placement='bottom'] {
        inset-inline: 0;
        inset-block-end: 0;
        block-size: var(--cv-drawer-size, 360px);
        max-block-size: var(--cv-drawer-max-size, calc(100dvh - 32px));
        border-radius: var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px))
          var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px)) 0 0;
        transform: translate3d(0, 100%, 0);
      }

      [part='panel'][data-state='open'] {
        opacity: 1;
        transform: translate3d(0, 0, 0);
      }

      @media (prefers-reduced-motion: reduce) {
        [part='overlay'],
        [part='panel'] {
          transition-duration: 0ms;
        }
      }

      [part='header'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
        padding: var(--cv-drawer-header-spacing, var(--cv-space-4, 16px));
      }

      [part='title'] {
        margin: 0;
        font-size: 1.05rem;
      }

      [part='description'] {
        margin: 0;
        color: var(--cv-color-text-muted, #9aa6bf);
      }

      [part='header-close'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 28px;
        min-inline-size: 28px;
        padding: 0;
        border-radius: var(--cv-radius-sm, 6px);
        border: none;
        background: transparent;
        color: var(--cv-color-text-muted, #9aa6bf);
        cursor: pointer;
      }

      [part='header-close']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='body'] {
        padding: var(--cv-drawer-body-spacing, var(--cv-space-4, 16px));
        overflow: auto;
      }

      [part='footer'] {
        display: flex;
        gap: var(--cv-space-2, 8px);
        justify-content: flex-end;
        padding: var(--cv-drawer-footer-spacing, var(--cv-space-4, 16px));
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.syncOutsideFocusListener(),this.syncScrollLock()}disconnectedCallback(){super.disconnectedCallback(),this.syncOutsideFocusListener(!0),this.releaseScrollLock(),this.clearAnimationQueue()}willUpdate(e){if(super.willUpdate(e),this.shouldAnimatePresence=!1,e.has("modal")||e.has("type")||e.has("closeOnEscape")||e.has("closeOnOutsidePointer")||e.has("closeOnOutsideFocus")||e.has("initialFocusId")||e.has("placement")){const t=this.model.state.isOpen();this.model=this.createModel(t)}e.has("open")&&this.model.state.isOpen()!==this.open&&(this.open?this.model.actions.open():this.model.actions.close()),e.has("open")&&(this.clearAnimationQueue(),this.open?(this.overlayVisible=!0,this.renderState=this.hasUpdated?"closed":"open"):(this.renderState="closed",this.hasUpdated||(this.overlayVisible=!1)),this.shouldAnimatePresence=this.hasUpdated)}updated(e){super.updated(e),this.syncOutsideFocusListener(),this.syncScrollLock(),e.has("open")&&(this.syncRenderedState(),this.suppressLifecycleFromUpdate?this.suppressLifecycleFromUpdate=!1:e.get("open")!==this.open&&this.dispatchLifecycleTransition(this.open),this.shouldAnimatePresence&&(this.open?this.startOpenAnimation():this.startCloseAnimation()),this.shouldAnimatePresence=!1,this.open&&this.focusInitialTarget())}clearAnimationQueue(){this.openAnimationFrame&&(cancelAnimationFrame(this.openAnimationFrame),this.openAnimationFrame=0),this.closeAnimationTimeout&&(window.clearTimeout(this.closeAnimationTimeout),this.closeAnimationTimeout=0)}startOpenAnimation(){this.openAnimationFrame=requestAnimationFrame(()=>{this.openAnimationFrame=0,this.open&&(this.renderState="open",this.syncRenderedState())})}startCloseAnimation(){const e=this.getTransitionDuration();if(e===0){this.overlayVisible=!1,this.syncRenderedState();return}this.closeAnimationTimeout=window.setTimeout(()=>{this.closeAnimationTimeout=0,!this.open&&(this.overlayVisible=!1,this.syncRenderedState())},e)}syncRenderedState(){const e=this.shadowRoot?.querySelector('[part="overlay"]'),t=this.shadowRoot?.querySelector('[part="panel"]');e&&(e.hidden=!this.overlayVisible,e.dataset.state=this.renderState),t&&(t.dataset.state=this.renderState)}getTransitionDuration(){const e=this.shadowRoot?.querySelector('[part="overlay"]'),t=this.shadowRoot?.querySelector('[part="panel"]');return Math.max(this.readTransitionDuration(e),this.readTransitionDuration(t))}readTransitionDuration(e){if(!e)return 0;const t=getComputedStyle(e),s=this.parseTimeValues(t.transitionDuration),a=this.parseTimeValues(t.transitionDelay),r=Math.max(s.length,a.length);let o=0;for(let n=0;n<r;n+=1){const l=s[n]??s[s.length-1]??0,d=a[n]??a[a.length-1]??0;o=Math.max(o,l+d)}return o}parseTimeValues(e){return e.split(",").map(t=>t.trim()).filter(Boolean).map(t=>t.endsWith("ms")?Number.parseFloat(t):t.endsWith("s")?Number.parseFloat(t)*1e3:Number.parseFloat(t)||0)}createModel(e=this.open){return mn({idBase:this.idBase,initialOpen:e,isModal:this.modal,type:this.type,placement:this.placement,closeOnEscape:this.closeOnEscape,closeOnOutsidePointer:this.closeOnOutsidePointer,closeOnOutsideFocus:this.closeOnOutsideFocus,initialFocusId:this.initialFocusId||void 0})}captureState(){return{open:this.model.state.isOpen(),restoreTargetId:this.model.state.restoreTargetId()}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}dispatchLifecycleEvent(e){this.dispatchEvent(new CustomEvent(e,{bubbles:!0,composed:!0}))}dispatchLifecycleTransition(e){const t=++this.lifecycleToken;this.dispatchLifecycleEvent(e?"cv-show":"cv-hide"),this.updateComplete.then(()=>{this.lifecycleToken===t&&this.dispatchLifecycleEvent(e?"cv-after-show":"cv-after-hide")})}applyInteractionResult(e){const t=this.model.state.isOpen();if(e.open!==t){const a={open:t};this.suppressLifecycleFromUpdate=!0,this.open=t,this.dispatchLifecycleTransition(t),this.dispatchInput(a),this.dispatchChange(a)}else this.open=t;const s=this.model.state.restoreTargetId();s&&e.restoreTargetId!==s&&this.shadowRoot?.querySelector(`[id="${s}"]`)?.focus()}syncOutsideFocusListener(e=!1){!e&&this.open?document.addEventListener("focusin",this.handleDocumentFocusIn):document.removeEventListener("focusin",this.handleDocumentFocusIn)}syncScrollLock(){if(!this.model.state.shouldLockScroll()){this.releaseScrollLock();return}this.lockScrollApplied||(this.previousBodyOverflow=document.body.style.overflow,document.body.style.overflow="hidden",this.lockScrollApplied=!0)}releaseScrollLock(){this.lockScrollApplied&&(document.body.style.overflow=this.previousBodyOverflow,this.lockScrollApplied=!1)}focusInitialTarget(){const t=this.model.contracts.getPanelProps()["data-initial-focus"];if(t){const a=this.querySelector(`#${t}`)??this.shadowRoot?.querySelector(`#${t}`);if(a){a.focus();return}}this.shadowRoot?.querySelector('[part="panel"]')?.focus()}handleDocumentFocusIn=e=>{if(!this.open||e.composedPath().includes(this))return;const s=this.captureState();this.model.actions.handleOutsideFocus(),this.applyInteractionResult(s)};handleTriggerClick(){const e=this.captureState();this.model.contracts.getTriggerProps().onClick(),this.applyInteractionResult(e)}handleTriggerKeyDown(e){(e.key==="Enter"||e.key===" "||e.key==="Spacebar")&&e.preventDefault();const t=this.captureState();this.model.contracts.getTriggerProps().onKeyDown({key:e.key}),this.applyInteractionResult(t)}handleOverlayPointerDown(e){if(e.target!==e.currentTarget)return;const t=this.captureState();this.model.contracts.getOverlayProps().onPointerDownOutside(),this.applyInteractionResult(t)}handlePanelKeyDown(e){e.key==="Escape"&&e.preventDefault();const t=this.captureState();this.model.contracts.getPanelProps().onKeyDown({key:e.key}),this.applyInteractionResult(t)}handleHeaderCloseClick(){const e=this.captureState();this.model.contracts.getHeaderCloseButtonProps().onClick(),this.applyInteractionResult(e)}render(){const e=this.model.contracts.getTriggerProps(),t=this.model.contracts.getOverlayProps(),s=this.model.contracts.getPanelProps(),a=this.model.contracts.getTitleProps(),r=this.model.contracts.getDescriptionProps(),o=this.model.contracts.getHeaderCloseButtonProps();return q`
      <button
        id=${e.id}
        role=${e.role}
        tabindex=${e.tabindex}
        aria-haspopup=${e["aria-haspopup"]}
        aria-expanded=${e["aria-expanded"]}
        aria-controls=${e["aria-controls"]}
        part="trigger"
        type="button"
        @click=${this.handleTriggerClick}
        @keydown=${this.handleTriggerKeyDown}
      >
        <slot name="trigger">Open drawer</slot>
      </button>

      <div
        id=${t.id}
        data-open=${t["data-open"]}
        data-state=${this.renderState}
        ?hidden=${!this.overlayVisible}
        part="overlay"
        @mousedown=${this.handleOverlayPointerDown}
      >
        <section
          id=${s.id}
          role=${s.role}
          tabindex=${s.tabindex}
          aria-modal=${s["aria-modal"]}
          aria-labelledby=${s["aria-labelledby"]??y}
          aria-describedby=${s["aria-describedby"]??y}
          data-placement=${s["data-placement"]}
          data-state=${this.renderState}
          data-initial-focus=${s["data-initial-focus"]??y}
          part="panel"
          @keydown=${this.handlePanelKeyDown}
        >
          <header part="header" ?hidden=${this.noHeader}>
            <h2 id=${a.id} part="title">
              <slot name="title">Drawer</slot>
            </h2>
            <p id=${r.id} part="description">
              <slot name="description"></slot>
            </p>
            <button
              id=${o.id}
              role=${o.role}
              tabindex=${o.tabindex}
              aria-label=${o["aria-label"]}
              type="button"
              part="header-close"
              @click=${this.handleHeaderCloseClick}
            >
              <slot name="header-close">&#10005;</slot>
            </button>
          </header>

          <div part="body">
            <slot></slot>
          </div>

          <footer part="footer">
            <slot name="footer"></slot>
          </footer>
        </section>
      </div>
    `}}let nl=0;class ll extends de{static elementName="cv-feed";static get properties(){return{label:{type:String,reflect:!0},busy:{type:Boolean,reflect:!0},loading:{type:Boolean,reflect:!0},empty:{type:Boolean,reflect:!0},error:{type:Boolean,reflect:!0}}}idBase=`cv-feed-${++nl}`;model;observer=null;constructor(){super(),this.label="",this.busy=!1,this.loading=!1,this.empty=!0,this.error=!1,this.model=this.createModel([])}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: flex;
        flex-direction: column;
        gap: var(--cv-feed-gap, var(--cv-space-3, 12px));
        padding-block: var(--cv-feed-padding-block, var(--cv-space-3, 12px));
        padding-inline: var(--cv-feed-padding-inline, 0);
      }

      [part='sentinel-top'],
      [part='sentinel-bottom'] {
        height: var(--cv-feed-sentinel-height, 1px);
        overflow: hidden;
      }

      [part='loading-indicator'] {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: var(--cv-feed-loading-min-height, 48px);
      }

      :host([busy]) [part='base'] {
        opacity: 0.8;
      }

      :host([empty]) [part='base'] {
        min-height: 0;
      }

      :host([error]) [part='base'] {
        min-height: 0;
      }

      :host([loading]) [part='base'] {
        /* loading state: host reflects attribute for consumer styling */
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.rebuildModel()}disconnectedCallback(){super.disconnectedCallback(),this.destroyObserver()}willUpdate(e){super.willUpdate(e),e.has("label")&&this.rebuildModel(),e.has("busy")&&this.model.actions.setBusy(this.busy),e.has("loading")&&this.model.state.isLoading.set(this.loading),e.has("error")&&(this.error?this.model.actions.setError("error"):this.model.actions.clearError())}updated(e){super.updated(e),this.setupObserver()}createModel(e){return ss({idBase:this.idBase,articles:e,ariaLabel:this.label||void 0})}getArticleElements(){return Array.from(this.querySelectorAll("cv-feed-article"))}rebuildModel(){const e=this.getArticleElements(),t=this.model.state.activeArticleId(),s=this.busy,a=this.loading,r=this.error,o=e.map(n=>({id:n.articleId,disabled:n.disabled}));this.model=ss({idBase:this.idBase,articles:o,ariaLabel:this.label||void 0,initialActiveArticleId:t}),s&&this.model.actions.setBusy(!0),a&&this.model.state.isLoading.set(!0),r&&this.model.actions.setError("error"),this.syncArticleElements(),this.syncHostAttributes()}syncArticleElements(){const e=this.getArticleElements();for(const t of e)if(t.articleId)try{const s=this.model.contracts.getArticleProps(t.articleId);t.id=s.id,t.setAttribute("role",s.role),t.setAttribute("tabindex",s.tabindex),t.setAttribute("aria-posinset",String(s["aria-posinset"])),t.setAttribute("aria-setsize",String(s["aria-setsize"])),t.setAttribute("data-active",s["data-active"]),s["aria-disabled"]?t.setAttribute("aria-disabled",s["aria-disabled"]):t.removeAttribute("aria-disabled"),t.active=s["data-active"]==="true"}catch{}}syncHostAttributes(){this.empty=this.model.state.isEmpty()}setupObserver(){if(this.destroyObserver(),typeof IntersectionObserver>"u")return;const e=this.shadowRoot?.querySelector('[part="sentinel-top"]'),t=this.shadowRoot?.querySelector('[part="sentinel-bottom"]');!e&&!t||(this.observer=new IntersectionObserver(s=>{for(const a of s)a.isIntersecting&&(a.target===t&&this.model.state.canLoadMore()&&(this.model.actions.loadMore(),this.dispatchEvent(new CustomEvent("cv-load-more",{detail:{},bubbles:!0,composed:!0}))),a.target===e&&this.model.state.canLoadNewer()&&(this.model.actions.loadNewer(),this.dispatchEvent(new CustomEvent("cv-load-newer",{detail:{},bubbles:!0,composed:!0}))))},{threshold:0}),e&&this.observer.observe(e),t&&this.observer.observe(t))}destroyObserver(){this.observer&&(this.observer.disconnect(),this.observer=null)}handleKeyDown(e){const t=this.model.actions.handleKeyDown({key:e.key,ctrlKey:e.ctrlKey,metaKey:e.metaKey});t!==null&&(e.preventDefault(),t==="next"||t==="prev"?(this.syncArticleElements(),this.requestUpdate()):t==="exit-after"?this.dispatchEvent(new CustomEvent("cv-exit-after",{detail:{},bubbles:!0,composed:!0})):t==="exit-before"&&this.dispatchEvent(new CustomEvent("cv-exit-before",{detail:{},bubbles:!0,composed:!0})))}handleSlotChange(){const t=this.getArticleElements().map(o=>({id:o.articleId,disabled:o.disabled})),s=this.model.state.articleIds(),a=t.map(o=>o.id);if(s.length!==a.length||s.some((o,n)=>o!==a[n])){const o=this.model.state.activeArticleId(),n=this.busy,l=this.loading,d=this.error;this.model=ss({idBase:this.idBase,articles:t,ariaLabel:this.label||void 0,initialActiveArticleId:o}),n&&this.model.actions.setBusy(!0),l&&this.model.state.isLoading.set(!0),d&&this.model.actions.setError("error"),this.syncArticleElements(),this.syncHostAttributes(),this.requestUpdate()}}render(){const e=this.model.contracts.getFeedProps();return q`
      <div
        id=${e.id}
        role=${e.role}
        aria-label=${e["aria-label"]??y}
        aria-labelledby=${e["aria-labelledby"]??y}
        aria-busy=${e["aria-busy"]}
        part="base"
        @keydown=${this.handleKeyDown}
      >
        <div part="sentinel-top"></div>
        ${this.loading?q`<div part="loading-indicator" aria-hidden="true">
              <slot name="loading"></slot>
            </div>`:y}
        ${this.empty?q`<slot name="empty" part="empty"></slot>`:y}
        ${this.error?q`<slot name="error" part="error"></slot>`:y}
        <slot @slotchange=${this.handleSlotChange}></slot>
        <div part="sentinel-bottom"></div>
      </div>
    `}}class cl extends de{static elementName="cv-feed-article";static get properties(){return{articleId:{type:String,attribute:"article-id",reflect:!0},active:{type:Boolean,reflect:!0},disabled:{type:Boolean,reflect:!0}}}constructor(){super(),this.articleId="",this.active=!1,this.disabled=!1}static styles=[Q`
      :host {
        display: block;
        outline: none;
      }

      [part='base'] {
        padding: var(--cv-feed-article-padding, var(--cv-space-3, 12px));
        border-radius: var(--cv-feed-article-border-radius, var(--cv-radius-sm, 6px));
      }

      :host([active]) [part='base'] {
        outline: var(--cv-feed-article-focus-ring, 2px solid var(--cv-color-primary, #65d7ff));
        outline-offset: -2px;
      }

      :host([disabled]) {
        opacity: 0.5;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`
      <div part="base" role="article">
        <slot></slot>
      </div>
    `}}class Ra extends ve{static elementName="cv-grid-cell";static get properties(){return{column:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0},selected:{type:Boolean,reflect:!0}}}constructor(){super(),this.column="",this.disabled=!1,this.active=!1,this.selected=!1}static styles=[Q`
      :host {
        display: table-cell;
        padding: var(--cv-space-2, 8px) var(--cv-space-3, 12px);
        border-bottom: 1px solid color-mix(in oklab, var(--cv-color-border, #2a3245) 70%, transparent);
        color: var(--cv-color-text, #e8ecf6);
        outline: none;
      }

      :host([active]) {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 14%, transparent);
      }

      :host([selected]) {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 24%, transparent);
      }

      :host([disabled]) {
        opacity: 0.55;
      }

      :host(:focus-visible) {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: -2px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<slot></slot>`}}class Bt extends ve{static elementName="cv-grid-column";static get properties(){return{value:{type:String,reflect:!0},label:{type:String,reflect:!0},index:{type:Number,reflect:!0},disabled:{type:Boolean,reflect:!0}}}constructor(){super(),this.value="",this.label="",this.index=0,this.disabled=!1}static styles=[Q`
      :host {
        display: table-cell;
        padding: var(--cv-space-2, 8px) var(--cv-space-3, 12px);
        border-bottom: 1px solid var(--cv-color-border, #2a3245);
        color: var(--cv-color-text, #e8ecf6);
        font-weight: 600;
        background: color-mix(in oklab, var(--cv-color-surface, #141923) 82%, transparent);
      }

      :host([disabled]) {
        opacity: 0.55;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<slot>${this.label}</slot>`}}class Pt extends ve{static elementName="cv-grid-row";static get properties(){return{value:{type:String,reflect:!0},index:{type:Number,reflect:!0},disabled:{type:Boolean,reflect:!0}}}constructor(){super(),this.value="",this.index=0,this.disabled=!1}static styles=[Q`
      :host {
        display: table-row;
      }

      :host([disabled]) {
        opacity: 0.55;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}handleSlotChange(){this.dispatchEvent(new CustomEvent("cv-grid-row-slotchange",{bubbles:!0,composed:!0}))}render(){return q`<slot @slotchange=${this.handleSlotChange}></slot>`}}const dl=new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End","PageUp","PageDown","Enter"," ","Spacebar"]),At=(i,e)=>`${i}::${e}`,zi=i=>{const[e,t,...s]=i.split("::");return s.length>0||!e||!t?null:{rowId:e,colId:t}},Ki=(i,e)=>{if(i.length!==e.length)return!1;const t=new Set(e);return i.every(s=>t.has(s))};let ul=0;class hl extends de{static elementName="cv-grid";static get properties(){return{value:{type:String,reflect:!0},selectedValues:{attribute:!1},selectionMode:{type:String,attribute:"selection-mode",reflect:!0},focusStrategy:{type:String,attribute:"focus-strategy",reflect:!0},selectionFollowsFocus:{type:Boolean,attribute:"selection-follows-focus",reflect:!0},pageSize:{type:Number,attribute:"page-size",reflect:!0},readOnly:{type:Boolean,attribute:"readonly",reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},ariaLabelledBy:{type:String,attribute:"aria-labelledby"},totalRowCount:{type:Number,attribute:"total-row-count",reflect:!0},totalColumnCount:{type:Number,attribute:"total-column-count",reflect:!0}}}idBase=`cv-grid-${++ul}`;columnRecords=[];rowRecords=[];cellRecords=[];validCellMap=new Map;cellListeners=new WeakMap;childObserver=null;model;constructor(){super(),this.value="",this.selectedValues=[],this.selectionMode="single",this.focusStrategy="roving-tabindex",this.selectionFollowsFocus=!1,this.pageSize=10,this.readOnly=!1,this.ariaLabel="",this.ariaLabelledBy="",this.totalRowCount=0,this.totalColumnCount=0,this.model=Ci({idBase:this.idBase,rows:[],columns:[],ariaLabel:"Grid"})}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: table;
        inline-size: 100%;
        border-collapse: collapse;
        border-spacing: 0;
        border: 1px solid var(--cv-color-border, #2a3245);
        border-radius: var(--cv-radius-md, 10px);
        overflow: hidden;
        background: var(--cv-color-surface, #141923);
      }

      [part='head'] {
        display: table-header-group;
      }

      [part='head-row'] {
        display: table-row;
      }

      [part='body'] {
        display: table-row-group;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.rebuildModelFromSlot(!1,!1),this.observeChildren()}disconnectedCallback(){super.disconnectedCallback(),this.detachCellListeners(),this.disconnectChildObserver()}observeChildren(){this.disconnectChildObserver(),this.childObserver=new MutationObserver(e=>{let t=!1;for(const s of e){for(const a of s.addedNodes)if(a instanceof HTMLElement){const r=a.tagName.toLowerCase();(r===Bt.elementName||r===Pt.elementName)&&(t=!0)}for(const a of s.removedNodes)if(a instanceof HTMLElement){const r=a.tagName.toLowerCase();(r===Bt.elementName||r===Pt.elementName)&&(t=!0)}}t&&this.rebuildModelFromSlot(!0,!0)}),this.childObserver.observe(this,{childList:!0})}disconnectChildObserver(){this.childObserver&&(this.childObserver.disconnect(),this.childObserver=null)}willUpdate(e){if(super.willUpdate(e),e.has("selectionMode")||e.has("focusStrategy")||e.has("selectionFollowsFocus")||e.has("pageSize")||e.has("readOnly")||e.has("ariaLabel")||e.has("ariaLabelledBy")||e.has("totalRowCount")||e.has("totalColumnCount")){this.rebuildModelFromSlot(!0,!1);return}if(e.has("value")){const t=this.value.trim();this.value!==t&&(this.value=t);const s=zi(t),a=this.captureSnapshot().activeKey,r=s?At(s.rowId,s.colId):null;if(s&&r!=null&&r!==a&&this.validCellMap.has(r)){const o=this.captureSnapshot();this.model.actions.setActiveCell(s),this.applyInteractionResult(o)}}if(e.has("selectedValues")){const t=this.captureSnapshot().selectedKeys,s=[...new Set(this.selectedValues.map(r=>r.trim()).filter(r=>r.length>0))];if(Ki(s,t))return;const a=this.captureSnapshot();this.setSelectedValuesInModel(s),this.applyInteractionResult(a)}}updated(e){super.updated(e),!e.has("value")&&!e.has("selectedValues")&&this.syncElementsFromModel()}resolveIndex(e){if(!(!Number.isFinite(e)||e<1))return Math.floor(e)}getColumnElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===Bt.elementName)}getRowElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===Pt.elementName)}getCellElements(e){return Array.from(e.children).filter(t=>t.tagName.toLowerCase()===Ra.elementName)}ensureColumnValue(e,t){const s=e.value?.trim();if(s)return s;const a=`column-${t+1}`;return e.value=a,a}ensureRowValue(e,t){const s=e.value?.trim();if(s)return s;const a=`row-${t+1}`;return e.value=a,a}resolveCellColumnId(e,t){const s=e.column?.trim();if(s)return s;const a=this.columnRecords[t]?.id??"";return e.column=a,a}cellFromKey(e){return zi(e)}keyFromCell(e){return e?At(e.rowId,e.colId):null}captureSnapshot(){return{activeKey:this.keyFromCell(this.model.state.activeCellId()),selectedKeys:[...this.model.state.selectedCellIds()]}}rebuildModelFromSlot(e,t=!0){const s=e?this.captureSnapshot():{activeKey:this.value.trim()||null,selectedKeys:[...new Set(this.selectedValues.map(u=>u.trim()).filter(u=>u.length>0))]};this.detachCellListeners(),this.columnRecords=[],this.rowRecords=[],this.cellRecords=[],this.validCellMap.clear(),this.columnRecords=this.getColumnElements().map((u,h)=>{const p=this.ensureColumnValue(u,h);return u.slot="columns",{id:p,index:this.resolveIndex(u.index),disabled:u.disabled,element:u}});const a=new Set(this.columnRecords.map(u=>u.id)),r=[];this.rowRecords=this.getRowElements().map((u,h)=>{const p=this.ensureRowValue(u,h);u.slot="rows";const v=this.getCellElements(u).map((g,f)=>{const x=this.resolveCellColumnId(g,f),m=At(p,x),I=a.has(x),$={key:m,rowId:p,colId:x,disabled:g.disabled,valid:I,element:g};return this.cellRecords.push($),I&&(this.validCellMap.set(m,$),$.disabled&&r.push({rowId:p,colId:x})),$});return{id:p,index:this.resolveIndex(u.index),disabled:u.disabled,cells:v,element:u}});const o=s.activeKey&&this.validCellMap.has(s.activeKey)?this.cellFromKey(s.activeKey):null,n=s.selectedKeys.filter(u=>this.validCellMap.has(u)).slice(0,this.selectionMode==="single"?1:void 0).map(u=>this.cellFromKey(u)).filter(u=>u!=null),l=this.ariaLabel.trim(),d=this.ariaLabelledBy.trim();this.model=Ci({idBase:this.idBase,rows:this.rowRecords.map(u=>({id:u.id,index:u.index,disabled:u.disabled})),columns:this.columnRecords.map(u=>({id:u.id,index:u.index,disabled:u.disabled})),disabledCells:r,ariaLabel:l||(d?void 0:"Grid"),ariaLabelledBy:d||void 0,focusStrategy:this.focusStrategy,selectionMode:this.selectionMode,selectionFollowsFocus:this.selectionFollowsFocus,pageSize:this.pageSize>0?this.pageSize:1,totalRowCount:this.totalRowCount>0?this.totalRowCount:void 0,totalColumnCount:this.totalColumnCount>0?this.totalColumnCount:void 0,initialActiveCellId:o,initialSelectedCellIds:n,isReadOnly:this.readOnly}),this.attachCellListeners(),this.syncElementsFromModel(),this.syncControlledValuesFromModel(),t&&this.requestUpdate()}detachCellListeners(){for(const e of this.cellRecords){const t=this.cellListeners.get(e.element);t&&(e.element.removeEventListener("focus",t.focus),e.element.removeEventListener("click",t.click),this.cellListeners.delete(e.element))}}attachCellListeners(){for(const e of this.cellRecords){if(!e.valid)continue;const t=()=>this.handleCellFocus(e.rowId,e.colId),s=a=>this.handleCellClick(a,e.rowId,e.colId);e.element.addEventListener("focus",t),e.element.addEventListener("click",s),this.cellListeners.set(e.element,{focus:t,click:s})}}syncControlledValuesFromModel(){const e=this.keyFromCell(this.model.state.activeCellId())??"",t=[...this.model.state.selectedCellIds()];this.value=e,this.selectedValues=t}syncElementsFromModel(){const e=this.model.contracts.getGridProps();for(const[s,a]of this.columnRecords.entries())a.element.slot="columns",a.element.setAttribute("role","columnheader"),a.element.setAttribute("aria-colindex",String(a.index??s+1)),a.disabled?a.element.setAttribute("aria-disabled","true"):a.element.removeAttribute("aria-disabled");for(const s of this.rowRecords){const a=this.model.contracts.getRowProps(s.id);s.element.id=a.id,s.element.slot="rows",s.element.setAttribute("role",a.role),s.element.setAttribute("aria-rowindex",String(a["aria-rowindex"]));for(const r of s.cells){if(r.element.hidden=!r.valid,!r.valid)continue;const o=this.model.contracts.getCellProps(r.rowId,r.colId);r.element.id=o.id,r.element.setAttribute("role",o.role),r.element.setAttribute("tabindex",o.tabindex),r.element.setAttribute("aria-colindex",String(o["aria-colindex"])),r.element.setAttribute("aria-selected",o["aria-selected"]),r.element.setAttribute("data-active",o["data-active"]),o["aria-readonly"]?r.element.setAttribute("aria-readonly",o["aria-readonly"]):r.element.removeAttribute("aria-readonly"),o["aria-disabled"]?r.element.setAttribute("aria-disabled",o["aria-disabled"]):r.element.removeAttribute("aria-disabled"),r.element.active=o["data-active"]==="true",r.element.selected=o["aria-selected"]==="true",r.element.disabled=o["aria-disabled"]==="true"}}const t=this.shadowRoot?.querySelector('[part="base"]');t&&(t.id=e.id)}getEventDetail(){return{value:this.value.trim()||null,activeCell:this.model.state.activeCellId(),selectedValues:[...this.model.state.selectedCellIds()]}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}applyInteractionResult(e){this.syncElementsFromModel();const t=this.captureSnapshot();this.syncControlledValuesFromModel();const s=e.activeKey!==t.activeKey,a=!Ki(e.selectedKeys,t.selectedKeys);if(!s&&!a)return;const r=this.getEventDetail();this.dispatchInput(r),this.dispatchChange(r)}setSelectedValuesInModel(e){const t=e.map(s=>this.cellFromKey(s)).filter(s=>s!=null).filter(s=>this.validCellMap.has(At(s.rowId,s.colId)));if(this.model.state.selectedCellIds.set(new Set),t.length!==0){if(this.selectionMode==="single"){const s=t[0];s&&this.model.actions.selectCell(s);return}for(const s of t)this.model.actions.toggleCellSelection(s)}}focusActiveCell(){if(this.focusStrategy!=="roving-tabindex")return;const e=this.keyFromCell(this.model.state.activeCellId());if(!e)return;const t=this.validCellMap.get(e);!t||t.element.disabled||t.element.focus()}handleCellFocus(e,t){const s=this.captureSnapshot();this.model.contracts.getCellProps(e,t).onFocus(),this.applyInteractionResult(s)}handleCellClick(e,t,s){if(this.model.contracts.getCellProps(t,s)["aria-disabled"]==="true")return;const r=this.captureSnapshot(),o={rowId:t,colId:s};this.model.actions.setActiveCell(o),this.selectionMode==="multiple"&&(e.metaKey||e.ctrlKey)?this.model.actions.toggleCellSelection(o):this.model.actions.selectCell(o),this.applyInteractionResult(r),this.focusActiveCell()}handleGridKeyDown(e){dl.has(e.key)&&e.preventDefault();const t=this.captureSnapshot();this.model.actions.handleKeyDown(e),this.applyInteractionResult(t),this.focusActiveCell()}handleColumnsSlotChange(){this.rebuildModelFromSlot(!0,!0)}handleRowsSlotChange(){this.rebuildModelFromSlot(!0,!0)}handleRowSlotChange(){this.rebuildModelFromSlot(!0,!0)}render(){const e=this.model.contracts.getGridProps();return q`
      <div
        id=${e.id}
        role=${e.role}
        tabindex=${e.tabindex}
        aria-label=${e["aria-label"]??y}
        aria-labelledby=${e["aria-labelledby"]??y}
        aria-multiselectable=${e["aria-multiselectable"]}
        aria-colcount=${String(e["aria-colcount"])}
        aria-rowcount=${String(e["aria-rowcount"])}
        aria-activedescendant=${e["aria-activedescendant"]??y}
        part="base"
        @keydown=${this.handleGridKeyDown}
      >
        <div role="rowgroup" part="head">
          <div role="row" part="head-row">
            <slot name="columns" @slotchange=${this.handleColumnsSlotChange}></slot>
          </div>
        </div>

        <div role="rowgroup" part="body" @cv-grid-row-slotchange=${this.handleRowSlotChange}>
          <slot name="rows" @slotchange=${this.handleRowsSlotChange}></slot>
        </div>
      </div>
    `}}const pl={CHILD:2},ml=i=>(...e)=>({_$litDirective$:i,values:e});class vl{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,s){this._$Ct=e,this._$AM=t,this._$Ci=s}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}}class bs extends vl{constructor(e){if(super(e),this.it=y,e.type!==pl.CHILD)throw Error(this.constructor.directiveName+"() can only be used in child bindings")}render(e){if(e===y||e==null)return this._t=void 0,this.it=e;if(e===Ge)return e;if(typeof e!="string")throw Error(this.constructor.directiveName+"() called with a non-string value");if(e===this.it)return this._t;this.it=e;const t=[e];return t.raw=t,this._t={_$litType$:this.constructor.resultType,strings:t,values:[]}}}bs.directiveName="unsafeHTML",bs.resultType=1;const _i=ml(bs);let as="/assets/icons/lucide";const fl=new Map;function bl(i){return i.trim().toLowerCase()}const gl={folder:"folder","folder-fill":"folder","folder-plus":"folder-plus","folder2-open":"folder-open","folder-open":"folder-open","folder-x":"folder-x","file-earmark-text":"file-text","file-earmark":"file","file-earmark-image":"file-image","file-earmark-pdf":"file-text","file-earmark-word":"file-text","file-earmark-excel":"file-spreadsheet","file-earmark-ppt":"file-text","file-earmark-zip":"file-archive","file-earmark-music":"file-music","file-earmark-play":"file-play","file-earmark-code":"file-code",file:"file","chevron-down":"chevron-down","chevron-up":"chevron-up","chevron-right":"chevron-right","chevron-left":"chevron-left","arrow-up":"arrow-up","arrow-down":"arrow-down","arrow-left":"arrow-left","arrow-right":"arrow-right","arrow-clockwise":"refresh-cw","arrow-repeat":"refresh-cw","arrows-move":"move",upload:"upload",download:"download","cloud-upload":"cloud-upload","cloud-download":"cloud-download",trash:"trash-2",pencil:"pencil","pencil-square":"square-pen",copy:"copy",clipboard:"clipboard",clipboard2:"clipboard",eye:"eye",search:"search",x:"x","x-lg":"x","plus-lg":"plus",check:"check",justify:"align-justify",bars:"menu",menu:"menu",list:"list","list-check":"list-checks",grid:"grid-2x2",table:"table",funnel:"funnel","three-dots":"ellipsis","three-dots-vertical":"ellipsis-vertical","dots-vertical":"ellipsis-vertical","ellipsis-vertical":"ellipsis-vertical","more-vertical":"ellipsis-vertical",kebab:"ellipsis-vertical",ellipsis:"ellipsis",more:"ellipsis","info-circle":"info","info-circle-fill":"info",info:"info","check-circle-fill":"check-circle","x-circle-fill":"x-circle","exclamation-triangle":"triangle-alert","exclamation-triangle-fill":"triangle-alert","pause-circle-fill":"pause-circle",house:"home","house-fill":"home",home:"home",key:"key",lock:"lock",database:"database",activity:"activity",settings:"settings",gear:"settings",tags:"tags",tag:"tag",star:"star",clock:"clock","wifi-off":"wifi-off",wifi:"wifi",globe:"globe","person-circle":"user-circle",user:"user","shield-lock":"shield","shield-check":"shield-check",sun:"sun",moon:"moon",eyeglasses:"glasses","calendar-plus":"calendar-plus",paperclip:"paperclip","box-arrow-up-right":"external-link","layout-three-columns":"columns-3",columns:"columns-2","sort-alpha-down":"arrow-down-a-z","sort-alpha-up":"arrow-up-a-z",hdd:"hard-drive","disc-fill":"disc",sticky:"sticky-note","sticky-note":"sticky-note","clock-history":"history",history:"history"};class ye extends de{static elementName="cv-icon";static svgCache=new Map;static inFlight=new Map;static get properties(){return{name:{type:String},src:{type:String},size:{type:String,reflect:!0},color:{type:String,reflect:!0},label:{type:String}}}svgMarkup="";hasSlottedContent=!1;constructor(){super(),this.name="",this.size="m",this.color="default"}static styles=[Q`
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        line-height: 0;
        color: inherit;
        inline-size: var(--cv-icon-size, 1em);
        block-size: var(--cv-icon-size, 1em);
      }

      :host([size='xs']) {
        --cv-icon-size: 12px;
      }

      :host([size='s']) {
        --cv-icon-size: 16px;
      }

      :host([size='m']),
      :host([size='md']) {
        --cv-icon-size: 20px;
      }

      :host([size='l']),
      :host([size='lg']) {
        --cv-icon-size: 24px;
      }

      :host([color='muted']) {
        color: var(--cv-color-text-muted, #9aa6bf);
      }

      :host([color='primary']) {
        color: var(--cv-color-primary, #65d7ff);
      }

      :host([color='success']) {
        color: var(--cv-color-success, #6ef7c8);
      }

      :host([color='warning']) {
        color: var(--cv-color-warning, #ffd36e);
      }

      :host([color='danger']) {
        color: var(--cv-color-danger, #ff7d86);
      }

      .icon {
        display: contents;
      }

      .icon svg,
      ::slotted(svg) {
        inline-size: 100%;
        block-size: 100%;
        display: block;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      :host([fill]) .icon svg,
      :host([fill]) ::slotted(svg) {
        fill: currentColor;
        stroke: none;
      }

      :host(:not([data-slotted])) slot {
        display: none;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}static prefetch(e){const t=Array.isArray(e)?e:[e];for(const s of t){const a=ye.getIconUrls(s);ye.fetchSvg(a)}}willUpdate(e){if(super.willUpdate(e),e.has("src")&&this.src){this.loadSvg(this.src);return}e.has("name")&&this.name&&!this.src&&this.loadSvg(ye.getIconUrls(this.name))}static resolveIconName(e){return gl[e]??e}static getCollectionBasePath(e){const t=bl(e);return t==="lucide"?as:fl.get(t)??null}static getIconUrls(e){const t=e.indexOf(":");if(t<=0||t===e.length-1)return[`${as}/${ye.resolveIconName(e)}.svg`];const s=e.slice(0,t),a=e.slice(t+1),r=ye.getCollectionBasePath(s),o=[];r&&o.push(`${r}/${a}.svg`);const n=`${as}/${ye.resolveIconName(a)}.svg`;return o.includes(n)||o.push(n),o}async loadSvg(e){this.svgMarkup=await ye.fetchSvg(e),this.requestUpdate()}static async fetchSvg(e){const t=Array.isArray(e)?e:[e];for(const s of t){const a=await ye.fetchSingleSvg(s);if(a)return a}return""}static async fetchSingleSvg(e){const t=ye.svgCache.get(e);if(t)return t;const s=ye.inFlight.get(e);if(s)return s;const a=(async()=>{try{const r=await fetch(e);if(!r.ok)return ye.inFlight.delete(e),"";const o=await r.text();return ye.svgCache.set(e,o),ye.inFlight.delete(e),o}catch{return ye.inFlight.delete(e),""}})();return ye.inFlight.set(e,a),a}handleSlotChange(e){const s=e.target.assignedNodes({flatten:!0});if(this.hasSlottedContent=s.some(a=>a.nodeType===Node.ELEMENT_NODE&&a.tagName==="SVG"),this.hasSlottedContent){this.setAttribute("data-slotted","");return}this.removeAttribute("data-slotted")}render(){const e=this.label?"false":"true",t=this.label??"";return this.svgMarkup&&!this.hasSlottedContent?q`
        <span class="icon" role="img" aria-hidden=${e} aria-label=${t}>
          ${_i(this.svgMarkup)}
        </span>
      `:q`
      <span class="icon" role="img" aria-hidden=${e} aria-label=${t}>
        <slot @slotchange=${this.handleSlotChange}></slot>
        ${this.svgMarkup?_i(this.svgMarkup):""}
      </span>
    `}}let yl=0;class xl extends Le{static elementName="cv-input";static get properties(){return{value:{type:String},type:{type:String},placeholder:{type:String},disabled:{type:Boolean,reflect:!0},readonly:{type:Boolean,reflect:!0},required:{type:Boolean,reflect:!0},clearable:{type:Boolean,reflect:!0},passwordToggle:{type:Boolean,reflect:!0,attribute:"password-toggle"},size:{type:String,reflect:!0},variant:{type:String,reflect:!0},name:{type:String},autofocus:{type:Boolean,reflect:!0},autocomplete:{type:String},maxlength:{type:Number},invalid:{type:Boolean,reflect:!0}}}model;_valueOnFocus="";defaultValue="";didCaptureDefaultValue=!1;didAutoFocus=!1;constructor(){super(),this.value="",this.type="text",this.placeholder="",this.disabled=!1,this.readonly=!1,this.required=!1,this.clearable=!1,this.passwordToggle=!1,this.size="medium",this.variant="outlined",this.name="",this.autofocus=!1,this.autocomplete="",this.maxlength=void 0,this.invalid=!1,this.model=this.createModel()}static styles=[Q`
      :host {
        display: inline-block;
        --cv-input-height: 36px;
        --cv-input-padding-inline: var(--cv-space-3, 12px);
        --cv-input-font-size: var(--cv-font-size-base, 14px);
        --cv-input-border-radius: var(--cv-radius-sm, 6px);
        --cv-input-border-color: var(--cv-color-border, #2a3245);
        --cv-input-background: transparent;
        --cv-input-color: var(--cv-color-text, #e8ecf6);
        --cv-input-placeholder-color: var(--cv-color-text-muted, #6b7a99);
        --cv-input-focus-ring: 0 0 0 2px var(--cv-color-primary, #65d7ff);
        --cv-input-icon-size: 1em;
        --cv-input-gap: var(--cv-space-2, 8px);
        --cv-input-transition-duration: var(--cv-duration-fast, 120ms);
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-input-gap);
        padding-inline: var(--cv-input-padding-inline);
        height: var(--cv-input-height);
        font-size: var(--cv-input-font-size);
        border-radius: var(--cv-input-border-radius);
        border: 1px solid var(--cv-input-border-color);
        background: var(--cv-input-background);
        color: var(--cv-input-color);
        cursor: text;
        transition:
          border-color var(--cv-input-transition-duration) var(--cv-easing-standard, ease),
          background var(--cv-input-transition-duration) var(--cv-easing-standard, ease),
          box-shadow var(--cv-input-transition-duration) var(--cv-easing-standard, ease);
        box-sizing: border-box;
        width: 100%;
      }

      [part='input'] {
        width: 100%;
        flex: 1;
        min-width: 0;
        border: none;
        outline: none;
        background: transparent;
        color: inherit;
        font: inherit;
        padding: 0;
        margin: 0;
      }

      [part='input']::placeholder {
        color: var(--cv-input-placeholder-color);
      }

      [part='prefix'],
      [part='suffix'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: var(--cv-input-icon-size);
      }

      [part='clear-button'],
      [part='password-toggle'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: var(--cv-input-icon-size);
        user-select: none;
      }

      [part='clear-button'][hidden],
      [part='password-toggle'][hidden] {
        display: none;
      }

      [part='password-toggle-icon'] {
        width: var(--cv-input-icon-size, 1em);
        height: var(--cv-input-icon-size, 1em);
        display: block;
      }

      [part='form-control-label'] {
        display: block;
      }

      [part='form-control-help-text'] {
        display: block;
      }

      /* --- variant: outlined (default) --- */
      :host([variant='outlined']) [part='base'] {
        border-color: var(--cv-input-border-color);
        background: var(--cv-input-background);
      }

      /* --- variant: filled --- */
      :host([variant='filled']) [part='base'] {
        background: var(--cv-color-surface, #141923);
        border-color: transparent;
      }

      /* --- focused --- */
      :host([focused]) [part='base'] {
        box-shadow: var(--cv-input-focus-ring);
      }

      :host([invalid]) [part='base'] {
        border-color: var(--cv-color-danger, #ef4444);
      }

      :host([invalid][focused]) [part='base'] {
        box-shadow: 0 0 0 2px color-mix(in oklch, var(--cv-color-danger, #ef4444) 35%, transparent);
      }

      /* --- sizes --- */
      :host([size='small']) {
        --cv-input-height: 30px;
        --cv-input-padding-inline: var(--cv-space-2, 8px);
        --cv-input-font-size: var(--cv-font-size-sm, 13px);
      }

      :host([size='large']) {
        --cv-input-height: 42px;
        --cv-input-padding-inline: var(--cv-space-4, 16px);
        --cv-input-font-size: var(--cv-font-size-md, 16px);
      }

      /* --- disabled --- */
      :host([disabled]) [part='base'] {
        opacity: 0.55;
        cursor: not-allowed;
      }

      :host([disabled]) [part='input'] {
        cursor: not-allowed;
      }

      /* --- readonly --- */
      :host([readonly]) [part='base'] {
        cursor: default;
      }

      :host([readonly]) [part='input'] {
        cursor: default;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.didCaptureDefaultValue||(this.defaultValue=this.value,this.didCaptureDefaultValue=!0)}updated(e){super.updated(e),(e.has("autofocus")||e.size===0)&&this.autofocus&&this.scheduleAutofocus()}willUpdate(e){super.willUpdate(e),e.has("value")&&this.model.state.value()!==this.value&&this.model.actions.setValue(this.value),e.has("type")&&this.model.actions.setType(this.type),e.has("disabled")&&this.model.actions.setDisabled(this.isEffectivelyDisabled()),e.has("readonly")&&this.model.actions.setReadonly(this.readonly),e.has("required")&&this.model.actions.setRequired(this.required),e.has("placeholder")&&this.model.actions.setPlaceholder(this.placeholder),e.has("clearable")&&this.model.actions.setClearable(this.clearable),e.has("passwordToggle")&&this.model.actions.setPasswordToggle(this.passwordToggle),this.toggleAttribute("focused",this.model.state.focused()),this.toggleAttribute("filled",this.model.state.filled()),this.syncFormAssociatedState()}onFormDisabledChanged(e){this.model.actions.setDisabled(this.isEffectivelyDisabled())}onFormReset(){this.value=this.defaultValue,this.model.actions.setValue(this.defaultValue)}onFormStateRestore(e){typeof e=="string"&&(this.value=e,this.model.actions.setValue(e))}focus(e){const t=this.shadowRoot?.querySelector('[part="input"]');if(t){t.focus(e);return}super.focus(e)}select(){this.shadowRoot?.querySelector('[part="input"]')?.select()}createModel(){return rn({idBase:`cv-input-${++yl}`,value:this.value,type:this.type,disabled:this.isEffectivelyDisabled(),readonly:this.readonly,required:this.required,placeholder:this.placeholder,clearable:this.clearable,passwordToggle:this.passwordToggle,onInput:e=>{this.value=e,this.dispatchEvent(new CustomEvent("cv-input",{detail:{value:e},bubbles:!0,composed:!0}))},onClear:()=>{this.value="",this.dispatchEvent(new CustomEvent("cv-clear",{detail:{},bubbles:!0,composed:!0}))}})}isEffectivelyDisabled(){return this.disabled||this.formDisabled}isFormAssociatedDisabled(){return this.isEffectivelyDisabled()}getFormAssociatedValue(){return this.model.state.value()}getFormAssociatedValidity(){const e=this.model.state.value();return this.invalid?{flags:{customError:!0},message:"Invalid value"}:this.required&&e.length===0?{flags:{valueMissing:!0},message:"Please fill out this field."}:{flags:{}}}scheduleAutofocus(){this.didAutoFocus||!this.autofocus||this.isEffectivelyDisabled()||(this.didAutoFocus=!0,queueMicrotask(()=>{this.focus({preventScroll:!0})}))}handleNativeInput(e){const t=e.target;this.model.actions.handleInput(t.value),this.syncFormAssociatedState()}handleNativeFocus(){this._valueOnFocus=this.model.state.value(),this.model.actions.setFocused(!0),this.requestUpdate(),this.dispatchEvent(new CustomEvent("cv-focus",{detail:{},bubbles:!0,composed:!0}))}handleNativeBlur(){this.model.actions.setFocused(!1),this.requestUpdate();const e=this.model.state.value();this.dispatchEvent(new CustomEvent("cv-blur",{detail:{},bubbles:!0,composed:!0})),e!==this._valueOnFocus&&this.dispatchEvent(new CustomEvent("cv-change",{detail:{value:e},bubbles:!0,composed:!0})),this.syncFormAssociatedState()}handleNativeKeyDown(e){if(e.key==="Enter"&&!e.defaultPrevented&&!e.shiftKey&&!e.altKey&&!e.ctrlKey&&!e.metaKey){const s=this.form??this.closest("form");s&&(e.preventDefault(),s.requestSubmit())}const t=this.model.state.filled();this.model.actions.handleKeyDown(e),t&&!this.model.state.filled()&&(this.value=""),this.syncFormAssociatedState()}handleClearClick(){this.model.actions.clear(),this.value=this.model.state.value(),this.syncFormAssociatedState()}handlePasswordToggleClick(){this.model.actions.togglePasswordVisibility(),this.requestUpdate()}render(){const e=this.model.contracts.getInputProps(),t=this.model.contracts.getClearButtonProps(),s=this.model.contracts.getPasswordToggleProps(),a=this.model.state.passwordVisible(),r=this.autocomplete||e.autocomplete,o=typeof this.maxlength=="number"&&Number.isFinite(this.maxlength)?this.maxlength:null;return q`
      <span part="form-control-label"><slot name="label"></slot></span>
      <div part="base">
        <span part="prefix"><slot name="prefix"></slot></span>
        <input
          part="input"
          id=${e.id}
          type=${e.type}
          .value=${this.model.state.value()}
          tabindex=${e.tabindex}
          aria-disabled=${e["aria-disabled"]??y}
          aria-readonly=${e["aria-readonly"]??y}
          aria-required=${e["aria-required"]??y}
          aria-invalid=${this.invalid?"true":y}
          placeholder=${e.placeholder??y}
          name=${this.name||y}
          maxlength=${o??y}
          ?disabled=${e.disabled}
          ?readonly=${e.readonly}
          autocomplete=${r??y}
          @input=${this.handleNativeInput}
          @focus=${this.handleNativeFocus}
          @blur=${this.handleNativeBlur}
          @keydown=${this.handleNativeKeyDown}
        />
        <span
          part="clear-button"
          role=${t.role}
          aria-label=${t["aria-label"]}
          tabindex=${t.tabindex}
          ?hidden=${t.hidden}
          aria-hidden=${t["aria-hidden"]??y}
          @click=${this.handleClearClick}
        >
          <slot name="clear-icon">&times;</slot>
        </span>
        <span
          part="password-toggle"
          role=${s.role}
          aria-label=${s["aria-label"]}
          aria-pressed=${s["aria-pressed"]}
          tabindex=${s.tabindex}
          ?hidden=${s.hidden}
          aria-hidden=${s["aria-hidden"]??y}
          @click=${this.handlePasswordToggleClick}
        >
          ${a?q`<slot name="hide-password-icon"
                ><svg part="password-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg></slot
              >`:q`<slot name="show-password-icon"
                ><svg part="password-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg></slot
              >`}
        </span>
        <span part="suffix"><slot name="suffix"></slot></span>
      </div>
      <span part="form-control-help-text"><slot name="help-text"></slot></span>
    `}}let wl=0;class $l extends de{static elementName="cv-landmark";static get properties(){return{type:{type:String,reflect:!0},label:{type:String,reflect:!0},labelId:{type:String,attribute:"label-id",reflect:!0}}}idBase=`cv-landmark-${++wl}`;model;constructor(){super(),this.type="region",this.label="",this.labelId="",this.model=this.createModel()}static styles=[Q`
      :host {
        display: block;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}willUpdate(e){super.willUpdate(e),(e.has("type")||e.has("label")||e.has("labelId"))&&(this.model=this.createModel())}createModel(){return no({idBase:this.idBase,type:this.type,label:this.label||void 0,labelId:this.labelId||void 0})}render(){const e=this.model.contracts.getLandmarkProps();return q`
      <section
        role=${e.role}
        aria-label=${e["aria-label"]??y}
        aria-labelledby=${e["aria-labelledby"]??y}
        part="base"
      >
        <slot></slot>
      </section>
    `}}class Ui extends ve{static elementName="cv-listbox-group";static get properties(){return{label:{type:String,reflect:!0}}}constructor(){super(),this.label=""}static styles=[Q`
      :host {
        display: grid;
        gap: var(--cv-listbox-group-gap, var(--cv-space-1, 4px));
      }

      :host([hidden]) {
        display: none;
      }

      [part='label'] {
        padding: 0 var(--cv-space-2, 8px);
        font-size: var(--cv-listbox-group-label-font-size, 0.85em);
        color: var(--cv-listbox-group-label-color, var(--cv-color-text-muted, #8892a6));
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`
      <div part="label">${this.label}</div>
      <slot></slot>
    `}}class Ft extends ve{static elementName="cv-option";static get properties(){return{value:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},selected:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0}}}constructor(){super(),this.value="",this.disabled=!1,this.selected=!1,this.active=!1}static styles=[Q`
      :host {
        display: block;
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      [part='base'] {
        display: flex;
        align-items: center;
        padding-block: var(--cv-option-padding-block, var(--cv-space-2, 8px));
        padding-inline: var(--cv-option-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-option-border-radius, var(--cv-radius-sm, 6px));
        color: var(--cv-color-text, #e8ecf6);
        background: transparent;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='prefix'],
      [part='label'],
      [part='suffix'] {
        display: contents;
      }

      :host([active]) [part='base'] {
        background: var(
          --cv-option-active-background,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, transparent)
        );
      }

      :host([selected]) [part='base'] {
        background: var(
          --cv-option-selected-background,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 34%, transparent)
        );
        color: var(--cv-color-text, #e8ecf6);
      }

      :host([disabled]) [part='base'] {
        opacity: var(--cv-option-disabled-opacity, 0.55);
      }

      :host(:focus-visible) [part='base'] {
        outline: 2px solid var(--cv-option-focus-outline-color, var(--cv-color-primary, #65d7ff));
        outline-offset: 1px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`
      <div part="base">
        <span part="prefix"><slot name="prefix"></slot></span>
        <span part="label"><slot></slot></span>
        <span part="suffix"><slot name="suffix"></slot></span>
      </div>
    `}}let kl=0;function Il(i,e){return i.length===e.length&&i.every((t,s)=>t===e[s])}function Sl(i){return i.key.toLowerCase()==="a"&&(i.ctrlKey||i.metaKey)?!0:["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End","Enter"," ","Spacebar","Escape"].includes(i.key)}class Cl extends de{static elementName="cv-listbox";static get properties(){return{selectionMode:{type:String,attribute:"selection-mode",reflect:!0},orientation:{type:String,reflect:!0},focusStrategy:{type:String,attribute:"focus-strategy",reflect:!0},selectionFollowsFocus:{type:Boolean,attribute:"selection-follows-focus"},rangeSelection:{type:Boolean,attribute:"range-selection"},typeahead:{type:Boolean},ariaLabel:{type:String,attribute:"aria-label"}}}idBase=`cv-listbox-${++kl}`;optionRecords=[];optionListeners=new WeakMap;model;constructor(){super(),this.selectionMode="single",this.orientation="vertical",this.focusStrategy="aria-activedescendant",this.selectionFollowsFocus=!1,this.rangeSelection=!1,this.typeahead=!0,this.ariaLabel=""}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-listbox-gap, var(--cv-space-1, 4px));
        padding: var(--cv-listbox-padding, var(--cv-space-1, 4px));
        border-radius: var(--cv-listbox-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-listbox-border-color, var(--cv-color-border, #2a3245));
        background: var(--cv-listbox-background, var(--cv-color-surface, #141923));
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-listbox-focus-outline-color, var(--cv-color-primary, #65d7ff));
        outline-offset: 1px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.model||this.rebuildModelFromSlot(!1,!1)}disconnectedCallback(){super.disconnectedCallback(),this.detachOptionListeners()}get value(){return this.model?this.model.state.selectedIds()[0]??null:null}set value(e){if(this.model){if(e==null){this.model.actions.clearSelected(),this.syncOptionElements();return}this.model.actions.selectOnly(e),this.syncOptionElements()}}get selectedValues(){return this.model?[...this.model.state.selectedIds()]:[]}willUpdate(e){super.willUpdate(e),(e.has("selectionMode")||e.has("orientation")||e.has("focusStrategy")||e.has("selectionFollowsFocus")||e.has("rangeSelection")||e.has("typeahead")||e.has("ariaLabel"))&&this.rebuildModelFromSlot(!0,!1)}updated(e){super.updated(e),this.syncOptionElements()}getAllOptionElements(){const e=[];for(const t of Array.from(this.children))if(t.tagName.toLowerCase()===Ft.elementName)e.push(t);else if(t.tagName.toLowerCase()===Ui.elementName)for(const s of Array.from(t.children))s.tagName.toLowerCase()===Ft.elementName&&e.push(s);return e}scanGroups(){const e=[],t=new Map;let s=0;for(const a of Array.from(this.children))if(a.tagName.toLowerCase()===Ui.elementName){const r=a,o=`group-${s++}`;e.push({id:o,label:r.label||""});for(const n of Array.from(a.children))n.tagName.toLowerCase()===Ft.elementName&&t.set(n,o)}return{groups:e,optionGroupMap:t}}getInitialSelectedFromOptions(e){return e.filter(t=>t.selected&&!t.disabled).map((t,s)=>this.ensureOptionValue(t,s))}ensureOptionValue(e,t){const s=e.value?.trim();if(s)return s;const a=`option-${t+1}`;return e.value=a,a}rebuildModelFromSlot(e,t=!0){const s=this.getAllOptionElements(),{groups:a,optionGroupMap:r}=this.scanGroups(),o=e?this.model?.state.selectedIds()??this.getInitialSelectedFromOptions(s):this.getInitialSelectedFromOptions(s),n=e?this.model?.state.activeId()??null:null;this.detachOptionListeners(),this.optionRecords=s.map((h,p)=>{const v=this.ensureOptionValue(h,p),g=h.textContent?.trim()||v,f=h.disabled,x=r.get(h);return{id:v,label:g,disabled:f,groupId:x,element:h}});const l=new Set(this.optionRecords.filter(h=>!h.disabled).map(h=>h.id)),d=o.filter(h=>l.has(h)),u=n&&l.has(n)?n:null;this.model=ka({idBase:this.idBase,options:this.optionRecords.map(h=>({id:h.id,label:h.label,disabled:h.disabled,groupId:h.groupId})),groups:a,selectionMode:this.selectionMode,orientation:this.orientation,focusStrategy:this.focusStrategy,selectionFollowsFocus:this.selectionFollowsFocus,rangeSelection:this.rangeSelection,typeahead:this.typeahead,ariaLabel:this.ariaLabel||void 0,initialSelectedIds:d,initialActiveId:u}),this.attachOptionListeners(),this.syncOptionElements(),t&&this.requestUpdate()}detachOptionListeners(){for(const e of this.optionRecords){const t=this.optionListeners.get(e.element);t&&(e.element.removeEventListener("click",t.click),e.element.removeEventListener("keydown",t.keydown),this.optionListeners.delete(e.element))}}attachOptionListeners(){if(this.model)for(const e of this.optionRecords){const t=()=>{this.handleOptionPointerSelect(e.id)},s=a=>{a.stopPropagation(),this.handleListboxKeyDown(a)};e.element.addEventListener("click",t),e.element.addEventListener("keydown",s),this.optionListeners.set(e.element,{click:t,keydown:s})}}syncOptionElements(){if(this.model)for(const e of this.optionRecords){const t=this.model.contracts.getOptionProps(e.id),s=t["aria-selected"]??"false";e.element.id=t.id,e.element.setAttribute("role",t.role),e.element.setAttribute("tabindex",t.tabindex),e.element.setAttribute("aria-selected",s),e.element.setAttribute("aria-setsize",t["aria-setsize"]),e.element.setAttribute("aria-posinset",t["aria-posinset"]),t["aria-disabled"]?e.element.setAttribute("aria-disabled",t["aria-disabled"]):e.element.removeAttribute("aria-disabled"),t["data-active"]==="true"?(e.element.setAttribute("data-active","true"),e.element.active=!0):(e.element.removeAttribute("data-active"),e.element.active=!1),e.element.selected=s==="true",e.element.disabled=e.disabled}}focusActiveOption(){if(!this.model||this.focusStrategy!=="roving-tabindex")return;const e=this.model.state.activeId();if(!e)return;this.optionRecords.find(s=>s.id===e)?.element.focus()}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}applyInteractionResult(e,t){if(!this.model)return;this.syncOptionElements();const s=this.model.state.selectedIds(),a=this.model.state.activeId(),r=!Il(e,s),o=t!==a;(o||r)&&this.dispatchInput({selectedValues:[...s],activeValue:a}),r&&this.dispatchChange({selectedValues:[...s],activeValue:a}),o&&this.focusActiveOption()}handleOptionPointerSelect(e){if(!this.model)return;const t=this.model.state.selectedIds(),s=this.model.state.activeId();this.model.actions.setActive(e),this.selectionMode==="multiple"?this.model.actions.toggleSelected(e):this.model.actions.selectOnly(e),this.applyInteractionResult(t,s)}handleListboxKeyDown(e){if(!this.model)return;const t=this.shadowRoot?.querySelector('[part="base"]');if(this.focusStrategy==="roving-tabindex"&&e.currentTarget===t)return;Sl(e)&&e.preventDefault();const s=this.model.state.selectedIds(),a=this.model.state.activeId();this.model.actions.handleKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(s,a)}handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}render(){const e=this.model?.contracts.getRootProps()??{role:"listbox",tabindex:this.focusStrategy==="aria-activedescendant"?"0":"-1","aria-orientation":this.orientation,"aria-label":this.ariaLabel||void 0,"aria-multiselectable":this.selectionMode==="multiple"?"true":void 0,"aria-activedescendant":void 0};return q`
      <div
        role=${e.role}
        tabindex=${e.tabindex}
        aria-orientation=${e["aria-orientation"]}
        aria-label=${e["aria-label"]??y}
        aria-multiselectable=${e["aria-multiselectable"]??y}
        aria-activedescendant=${e["aria-activedescendant"]??y}
        part="base"
        @keydown=${this.handleListboxKeyDown}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `}}let El=0;class Al extends de{static elementName="cv-link";static get properties(){return{href:{type:String,reflect:!0}}}idBase=`cv-link-${++El}`;model;constructor(){super(),this.href="",this.model=this.createModel()}static styles=[Q`
      :host {
        display: inline-block;
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-link-gap, var(--cv-space-1, 4px));
        color: var(--cv-link-color, var(--cv-color-primary, #65d7ff));
        text-decoration: var(--cv-link-text-decoration, underline);
        text-underline-offset: 3px;
        text-decoration-thickness: 1px;
        transition: color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host(:hover) [part='base'] {
        color: var(
          --cv-link-color-hover,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 78%, white)
        );
        text-decoration: var(--cv-link-text-decoration-hover, none);
      }

      :host(:active) [part='base'] {
        color: var(
          --cv-link-color-active,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 60%, white)
        );
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-link-outline-color, var(--cv-color-primary, #65d7ff));
        outline-offset: var(--cv-link-outline-offset, 2px);
        border-radius: 4px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}willUpdate(e){super.willUpdate(e),e.has("href")&&(this.model=this.createModel())}createModel(){return ho({idBase:this.idBase,href:this.href||void 0,isSemanticHost:!0,onPress:()=>{this.dispatchEvent(new CustomEvent("press",{detail:{href:this.href},bubbles:!0,composed:!0}))}})}handleClick(e){this.model.contracts.getLinkProps().onClick(e)}handleKeyDown(e){this.model.contracts.getLinkProps().onKeyDown(e)}render(){const e=this.model.contracts.getLinkProps();return q`
      <a
        id=${e.id}
        href=${e.href??y}
        part="base"
        @click=${this.handleClick}
        @keydown=${this.handleKeyDown}
      >
        <span part="prefix"><slot name="prefix"></slot></span>
        <span part="label"><slot></slot></span>
        <span part="suffix"><slot name="suffix"></slot></span>
      </a>
    `}}const Dl=new Set(["ArrowUp","ArrowDown","Home","End","Enter"," ","Spacebar","Escape","Tab"]);let Ll=0;class Ol extends de{static elementName="cv-menu";static get properties(){return{value:{type:String,reflect:!0},open:{type:Boolean,reflect:!0},closeOnSelect:{type:Boolean,attribute:"close-on-select",reflect:!0},ariaLabel:{type:String,attribute:"aria-label"}}}idBase=`cv-menu-${++Ll}`;itemRecords=[];itemListeners=new WeakMap;model;constructor(){super(),this.value="",this.open=!1,this.closeOnSelect=!0,this.ariaLabel=""}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-menu-gap, var(--cv-space-1, 4px));
        padding: var(--cv-menu-padding, var(--cv-space-1, 4px));
        border-radius: var(--cv-menu-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-menu-border-color, var(--cv-color-border, #2a3245));
        background: var(--cv-menu-background, var(--cv-color-surface-elevated, #1d2432));
        box-shadow: var(--cv-menu-shadow, var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24)));
        max-height: var(--cv-menu-max-height, none);
        min-inline-size: var(--cv-menu-min-inline-size, 180px);
        overflow-y: auto;
      }

      [part='base'][hidden] {
        display: none;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.model||this.rebuildModelFromSlot(!1,!1),this.syncOutsidePointerListener()}disconnectedCallback(){super.disconnectedCallback(),this.detachItemListeners(),this.syncOutsidePointerListener(!0)}willUpdate(e){if(super.willUpdate(e),e.has("closeOnSelect")||e.has("ariaLabel")){this.rebuildModelFromSlot(!0,!1);return}if(this.model){if(e.has("value")){const t=this.value.trim();if(this.value!==t&&(this.value=t),t.length>0&&this.model.state.selectedId()!==t){const s=this.captureState(),a=this.model.state.isOpen();this.model.actions.select(t),a&&!this.model.state.isOpen()&&this.model.actions.open(),this.applyInteractionResult(s)}}if(e.has("open")&&this.model.state.isOpen()!==this.open){const t=this.captureState();this.open?this.model.actions.open():this.model.actions.close(),this.applyInteractionResult(t)}}}updated(e){super.updated(e),this.syncOutsidePointerListener(),!e.has("value")&&!e.has("open")&&this.syncItemElements()}getItemElements(){const e=[];for(const t of Array.from(this.children))if(t.tagName.toLowerCase()===ft.elementName)e.push(t);else if(t.tagName.toLowerCase()==="cv-menu-group")for(const s of Array.from(t.children))s.tagName.toLowerCase()===ft.elementName&&e.push(s);return e}ensureItemValue(e,t){const s=e.value?.trim();if(s)return s;const a=`item-${t+1}`;return e.value=a,a}rebuildModelFromSlot(e,t=!0){const s=this.getItemElements(),a=e?this.captureState():{activeId:null,open:this.open,value:this.value||null};this.detachItemListeners(),this.itemRecords=s.map((n,l)=>{const d=this.ensureItemValue(n,l),u=n.label?.trim()||n.textContent?.trim()||d,h=n.type||"normal",p=n.hasSubmenu||n.querySelector('[slot="submenu"]')!=null;let v="normal",g;const f=n.parentElement;if(f&&f.tagName.toLowerCase()==="cv-menu-group"){const m=f.getAttribute("type");(m==="checkbox"||m==="radio")&&(v=m,g=f.getAttribute("label")||void 0)}const x=h!=="normal"?h:v;return{id:d,label:u,disabled:n.disabled,type:x,checked:n.checked,hasSubmenu:p,group:g,element:n}});const r=new Set(this.itemRecords.filter(n=>!n.disabled).map(n=>n.id)),o=a.activeId&&r.has(a.activeId)?a.activeId:null;if(this.model=Ts({idBase:this.idBase,items:this.itemRecords.map(n=>({id:n.id,label:n.label,disabled:n.disabled,type:n.type,checked:n.checked,hasSubmenu:n.hasSubmenu,group:n.group})),initialOpen:a.open,initialActiveId:o,closeOnSelect:this.closeOnSelect,ariaLabel:this.ariaLabel||void 0}),a.value&&r.has(a.value)){const n=this.model.state.isOpen();this.model.actions.select(a.value),n&&!this.model.state.isOpen()&&this.model.actions.open()}o&&this.model.actions.setActive(o),this.attachItemListeners(),this.syncItemElements(),this.value=this.model.state.selectedId()??"",this.open=this.model.state.isOpen(),t&&this.requestUpdate()}detachItemListeners(){for(const e of this.itemRecords){const t=this.itemListeners.get(e.element);t&&(e.element.removeEventListener("click",t.click),e.element.removeEventListener("focus",t.focus),this.itemListeners.delete(e.element))}}attachItemListeners(){if(this.model)for(const e of this.itemRecords){const t=a=>{a.preventDefault(),this.handleItemClick(e.id)},s=()=>{this.handleItemFocus(e.id)};e.element.addEventListener("click",t),e.element.addEventListener("focus",s),this.itemListeners.set(e.element,{click:t,focus:s})}}syncItemElements(){if(!this.model)return;const e=this.model.state.selectedId();for(const t of this.itemRecords){const s=this.model.contracts.getItemProps(t.id);t.element.id=s.id,t.element.setAttribute("role",s.role),t.element.setAttribute("tabindex",s.tabindex),s["aria-disabled"]?t.element.setAttribute("aria-disabled",s["aria-disabled"]):t.element.removeAttribute("aria-disabled"),t.element.setAttribute("data-active",s["data-active"]),t.element.active=s["data-active"]==="true",t.element.selected=e===t.id,t.element.disabled=s["aria-disabled"]==="true",t.element.hidden=!this.open,s["aria-checked"]!=null?(t.element.setAttribute("aria-checked",s["aria-checked"]),t.element.checked=s["aria-checked"]==="true"):t.element.removeAttribute("aria-checked"),s["aria-haspopup"]?t.element.setAttribute("aria-haspopup",s["aria-haspopup"]):t.element.removeAttribute("aria-haspopup"),s["aria-expanded"]!=null?t.element.setAttribute("aria-expanded",s["aria-expanded"]):t.element.removeAttribute("aria-expanded")}}captureState(){return{value:this.model?.state.selectedId()??(this.value.trim()||null),activeId:this.model?.state.activeId()??null,open:this.model?.state.isOpen()??this.open}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}focusActiveItem(){if(!this.model||!this.open)return;const e=this.model.state.activeId();if(!e)return;this.itemRecords.find(s=>s.id===e)?.element.focus()}applyInteractionResult(e){if(!this.model)return;const t=this.captureState();this.value=t.value??"",this.open=t.open,this.syncItemElements();const s=e.value!==t.value,a=e.activeId!==t.activeId,r=e.open!==t.open;if(s||a||r){const o={value:t.value,activeId:t.activeId,open:t.open};this.dispatchInput(o),s&&this.dispatchChange(o)}a&&this.focusActiveItem()}handleItemFocus(e){if(!this.model)return;const t=this.captureState();this.model.actions.setActive(e),this.applyInteractionResult(t)}handleItemClick(e){if(!this.model)return;const t=this.itemRecords.find(a=>a.id===e);if(!t||t.disabled)return;const s=this.captureState();this.model.actions.select(e),this.applyInteractionResult(s)}handleMenuKeyDown(e){if(!this.model)return;Dl.has(e.key)&&e.preventDefault();const t=this.captureState();this.model.actions.handleMenuKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(t)}syncOutsidePointerListener(e=!1){!e&&this.open?document.addEventListener("pointerdown",this.handleDocumentPointerDown):document.removeEventListener("pointerdown",this.handleDocumentPointerDown)}handleDocumentPointerDown=e=>{if(!this.model||!this.model.state.isOpen()||e.composedPath().includes(this))return;const s=this.captureState();this.model.actions.close(),this.applyInteractionResult(s)};handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}render(){const e=this.model?.contracts.getMenuProps()??{id:`${this.idBase}-menu`,role:"menu",tabindex:"-1","aria-label":this.ariaLabel||void 0};return q`
      <div
        id=${e.id}
        role=${e.role}
        tabindex=${e.tabindex}
        aria-label=${e["aria-label"]??y}
        ?hidden=${!this.open}
        part="base"
        @keydown=${this.handleMenuKeyDown}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `}}const Ml=new Set(["ArrowUp","ArrowDown","Home","End","Enter"," ","Spacebar","Escape","Tab"]);let Rl=0;class Tl extends de{static elementName="cv-menu-button";static get properties(){return{value:{type:String,reflect:!0},open:{type:Boolean,reflect:!0},disabled:{type:Boolean,reflect:!0},split:{type:Boolean,reflect:!0},size:{type:String,reflect:!0},variant:{type:String,reflect:!0},closeOnSelect:{type:Boolean,attribute:"close-on-select",reflect:!0},ariaLabel:{type:String,attribute:"aria-label"}}}idBase=`cv-menu-button-${++Rl}`;itemRecords=[];itemListeners=new WeakMap;hasPrefixContent=!1;hasLabelContent=!1;hasSuffixContent=!1;model;hasLayoutListeners=!1;layoutFrame=-1;constructor(){super(),this.value="",this.open=!1,this.disabled=!1,this.split=!1,this.size="medium",this.variant="default",this.closeOnSelect=!0,this.ariaLabel=""}static styles=[Q`
      :host {
        display: inline-block;
        --cv-menu-button-min-height: 36px;
        --cv-menu-button-padding-inline: var(--cv-space-3, 12px);
        --cv-menu-button-padding-block: var(--cv-space-2, 8px);
        --cv-menu-button-border-radius: var(--cv-radius-sm, 6px);
        --cv-menu-button-gap: var(--cv-space-2, 8px);
        --cv-menu-button-font-size: inherit;
        --cv-menu-button-menu-offset: var(--cv-space-1, 4px);
        --cv-menu-button-menu-min-inline-size: 180px;
        --cv-menu-button-menu-z-index: 20;
      }

      [part='base'] {
        position: relative;
        display: inline-flex;
      }

      /* --- shared button styles --- */
      [part='trigger'],
      [part='action'],
      [part='dropdown'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--cv-menu-button-gap);
        min-block-size: var(--cv-menu-button-min-height);
        padding: var(--cv-menu-button-padding-block) var(--cv-menu-button-padding-inline);
        font-size: var(--cv-menu-button-font-size);
        border-radius: var(--cv-menu-button-border-radius);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
        font: inherit;
      }

      [part='trigger']:focus-visible,
      [part='action']:focus-visible,
      [part='dropdown']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      /* --- label / prefix / suffix / dropdown-icon --- */
      [part='label'] {
        display: inline-flex;
        align-items: center;
      }

      [part='prefix'],
      [part='suffix'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      [part='prefix'][hidden],
      [part='label'][hidden],
      [part='suffix'][hidden] {
        display: none;
      }

      [part='dropdown-icon'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      [part='dropdown-icon'] svg {
        width: 12px;
        height: 12px;
        fill: currentColor;
      }

      /* --- menu popup --- */
      [part='menu'] {
        position: absolute;
        left: 0;
        top: calc(100% + var(--cv-menu-button-menu-offset));
        z-index: var(--cv-menu-button-menu-z-index);
        box-sizing: border-box;
        inline-size: fit-content;
        min-inline-size: var(--cv-menu-button-menu-min-inline-size);
        max-inline-size: var(--cv-menu-button-menu-max-inline-size, calc(100vw - 16px));
        max-block-size: var(--cv-menu-button-menu-max-block-size, calc(100dvh - 16px));
        display: inline-grid;
        gap: var(--cv-space-1, 4px);
        align-content: start;
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        box-shadow: var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24));
        overflow-y: auto;
      }

      [part='menu'][hidden] {
        display: none;
      }

      ::slotted([slot='menu']) {
        display: block;
      }

      /* --- :host([open]) --- */
      :host([open]) [part='trigger'],
      :host([open]) [part='dropdown'] {
        border-color: var(--cv-color-primary, #65d7ff);
      }

      /* --- :host([disabled]) --- */
      :host([disabled]) {
        opacity: 0.55;
        pointer-events: none;
        cursor: not-allowed;
      }

      /* --- :host([split]) --- */
      :host([split]) [part='base'] {
        display: inline-flex;
      }

      :host([split]) [part='action'] {
        border-start-end-radius: 0;
        border-end-end-radius: 0;
        border-inline-end: none;
      }

      :host([split]) [part='dropdown'] {
        border-start-start-radius: 0;
        border-end-start-radius: 0;
        padding-inline: var(--cv-space-2, 8px);
      }

      /* --- sizes --- */
      :host([size='small']) {
        --cv-menu-button-min-height: 30px;
        --cv-menu-button-padding-inline: var(--cv-space-2, 8px);
        --cv-menu-button-padding-block: var(--cv-space-1, 4px);
      }

      :host([size='large']) {
        --cv-menu-button-min-height: 42px;
        --cv-menu-button-padding-inline: var(--cv-space-4, 16px);
        --cv-menu-button-padding-block: var(--cv-space-2, 8px);
      }

      /* --- variant: default --- */
      :host([variant='default']) [part='trigger'],
      :host([variant='default']) [part='action'],
      :host([variant='default']) [part='dropdown'] {
        border-color: var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      /* --- variant: primary --- */
      :host([variant='primary']) [part='trigger'],
      :host([variant='primary']) [part='action'],
      :host([variant='primary']) [part='dropdown'] {
        border-color: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, var(--cv-color-surface, #141923));
      }

      /* --- variant: danger --- */
      :host([variant='danger']) [part='trigger'],
      :host([variant='danger']) [part='action'],
      :host([variant='danger']) [part='dropdown'] {
        border-color: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 22%, var(--cv-color-surface, #141923));
      }

      /* --- variant: ghost --- */
      :host([variant='ghost']) [part='trigger'],
      :host([variant='ghost']) [part='action'],
      :host([variant='ghost']) [part='dropdown'] {
        background: transparent;
        border-color: transparent;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.syncContentParts(),this.model||this.rebuildModelFromSlot(!1,!1),this.syncOutsidePointerListener()}disconnectedCallback(){super.disconnectedCallback(),this.detachItemListeners(),this.syncOutsidePointerListener(!0),this.toggleLayoutListeners(!1),this.cancelLayoutFrame()}willUpdate(e){if(super.willUpdate(e),e.has("closeOnSelect")||e.has("ariaLabel")||e.has("split")){this.rebuildModelFromSlot(!0,!1);return}if(this.model){if(e.has("value")){const t=this.value.trim();if(t.length>0&&this.value!==t&&(this.value=t),t.length>0){const s=this.itemRecords.find(a=>a.id===t);if(s&&!s.disabled){const a=this.captureState();this.model.actions.select(t),this.applyInteractionResult(a,t)}}}if(e.has("open")&&this.model.state.isOpen()!==this.open){const t=this.captureState();this.open?this.model.actions.open():this.model.actions.close(),this.applyInteractionResult(t)}}}updated(e){super.updated(e),this.syncOutsidePointerListener();const t=this.open;if(this.toggleLayoutListeners(t),this.open){const s=this.getMenuElement();s&&(s.style.visibility="hidden"),this.scheduleLayout()}else{this.cancelLayoutFrame();const s=this.getMenuElement();s&&this.clearInlineLayout(s)}!e.has("value")&&!e.has("open")&&this.syncItemElements()}getMenuElement(){return this.shadowRoot?.querySelector('[part="menu"]')}getBaseElement(){return this.shadowRoot?.querySelector('[part="base"]')}clearInlineLayout(e){e.style.position="",e.style.top="",e.style.left="",e.style.bottom="",e.style.right="",e.style.transform="",e.style.translate="",e.style.minWidth="",e.style.visibility=""}getMenuOffset(){const e=getComputedStyle(this).getPropertyValue("--cv-menu-button-menu-offset").trim(),t=Number.parseFloat(e);return Number.isFinite(t)?t:4}getMenuMinInlineSize(){const e=getComputedStyle(this).getPropertyValue("--cv-menu-button-menu-min-inline-size").trim(),t=Number.parseFloat(e);return Number.isFinite(t)?t:180}applyMenuLayout(e,t){const s=t.getBoundingClientRect(),a=Math.max(this.getMenuMinInlineSize(),Math.ceil(s.width));e.style.position="absolute",e.style.minWidth=`${a}px`,e.style.top="0px",e.style.left="0px",e.style.bottom="auto",e.style.right="auto",e.style.transform="none",e.style.translate="none",e.style.visibility="hidden";const r=e.getBoundingClientRect(),o=window.innerWidth,n=window.innerHeight,l=this.getMenuOffset(),d=8,u=Math.max(0,s.top-d-l),h=Math.max(0,n-s.bottom-d-l);let v=h<r.height+l&&u>h?s.top-r.height-l:s.bottom+l,g=s.left;const f=Math.max(d,o-r.width-d),x=Math.max(d,n-r.height-d);g=Math.min(Math.max(g,d),f),v=Math.min(Math.max(v,d),x),e.style.position="absolute",e.style.top=`${v-s.top}px`,e.style.left=`${g-s.left}px`,e.style.bottom="auto",e.style.right="auto",e.style.transform="none",e.style.translate="none",e.style.visibility="visible"}syncMenuLayout(){const e=this.getMenuElement(),t=this.getBaseElement();!e||!t||this.applyMenuLayout(e,t)}cancelLayoutFrame(){this.layoutFrame!==-1&&(cancelAnimationFrame(this.layoutFrame),this.layoutFrame=-1)}scheduleLayout(){this.cancelLayoutFrame(),this.layoutFrame=requestAnimationFrame(()=>{this.layoutFrame=-1,this.syncMenuLayout()})}toggleLayoutListeners(e){if(this.hasLayoutListeners!==e){if(this.hasLayoutListeners=e,e){window.addEventListener("resize",this.handleViewportChange),window.addEventListener("scroll",this.handleViewportChange,!0);return}window.removeEventListener("resize",this.handleViewportChange),window.removeEventListener("scroll",this.handleViewportChange,!0)}}handleViewportChange=()=>{this.open&&this.scheduleLayout()};getItemElements(){return Array.from(this.querySelectorAll(':scope > [slot="menu"]')).filter(e=>e.tagName.toLowerCase()===ft.elementName)}syncContentParts(){const e=this.hasNamedSlotContent("prefix"),t=this.hasDefaultSlotContent(),s=this.hasNamedSlotContent("suffix"),a=this.hasPrefixContent!==e||this.hasLabelContent!==t||this.hasSuffixContent!==s;return this.hasPrefixContent=e,this.hasLabelContent=t,this.hasSuffixContent=s,a}hasNamedSlotContent(e){return Array.from(this.children).some(t=>t.getAttribute("slot")===e)}hasDefaultSlotContent(){for(const e of this.childNodes){if(e.nodeType===Node.TEXT_NODE&&e.textContent?.trim())return!0;if(e.nodeType!==Node.ELEMENT_NODE)continue;if(!e.getAttribute("slot"))return!0}return!1}ensureItemValue(e,t){const s=e.value?.trim();if(s)return s;const a=`item-${t+1}`;return e.value=a,a}rebuildModelFromSlot(e,t=!0){const s=this.getItemElements(),a=e?this.captureState():{activeId:null,open:this.open,value:this.value||null};this.detachItemListeners(),this.itemRecords=s.map((n,l)=>{const d=this.ensureItemValue(n,l),u=n.textContent?.trim()||d;return{id:d,label:u,disabled:n.disabled,element:n}});const r=new Set(this.itemRecords.filter(n=>!n.disabled).map(n=>n.id)),o=a.activeId&&r.has(a.activeId)?a.activeId:null;this.model=Uo({idBase:this.idBase,items:this.itemRecords.map(n=>({id:n.id,label:n.label,disabled:n.disabled})),ariaLabel:this.ariaLabel||void 0,initialOpen:a.open,initialActiveId:o,closeOnSelect:this.closeOnSelect}),this.value=a.value??"",this.open=this.model.state.isOpen(),this.prefetchMenuIcons(),this.attachItemListeners(),this.syncItemElements(),t&&this.requestUpdate()}prefetchMenuIcons(){const e=[];for(const t of this.itemRecords){const s=t.element.querySelectorAll(ye.elementName);for(const a of s){const r=a.getAttribute("name");r&&e.push(r)}}e.length>0&&ye.prefetch(e)}detachItemListeners(){for(const e of this.itemRecords){const t=this.itemListeners.get(e.element);t&&(e.element.removeEventListener("click",t.click),e.element.removeEventListener("keydown",t.keydown),this.itemListeners.delete(e.element))}}attachItemListeners(){if(this.model)for(const e of this.itemRecords){const t=a=>{a.preventDefault(),this.handleItemClick(e.id)},s=a=>{a.stopPropagation(),this.handleKeyDown(a)};e.element.addEventListener("click",t),e.element.addEventListener("keydown",s),this.itemListeners.set(e.element,{click:t,keydown:s})}}syncItemElements(){if(this.model)for(const e of this.itemRecords){const t=this.model.contracts.getItemProps(e.id);e.element.id=t.id,e.element.setAttribute("role",t.role),e.element.setAttribute("tabindex",t.tabindex),t["aria-disabled"]?e.element.setAttribute("aria-disabled",t["aria-disabled"]):e.element.removeAttribute("aria-disabled"),e.element.setAttribute("data-active",t["data-active"]),e.element.active=t["data-active"]==="true",e.element.selected=this.value===e.id,e.element.disabled=t["aria-disabled"]==="true",e.element.hidden=!this.open}}captureState(){return{value:this.value.trim()||null,activeId:this.model?.state.activeId()??null,open:this.model?.state.isOpen()??this.open,restoreTargetId:this.model?.state.restoreTargetId()??null}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}dispatchAction(){this.dispatchEvent(new CustomEvent("cv-action",{detail:{},bubbles:!0,composed:!0}))}focusActiveItem(){if(!this.model||!this.open)return;const e=this.model.state.activeId();if(!e)return;this.itemRecords.find(s=>s.id===e)?.element.focus()}applyInteractionResult(e,t){if(!this.model)return;const s=this.captureState(),a=t===void 0?e.value:t;this.value=a??"",this.open=s.open,this.syncItemElements();const r=e.value!==a,o=e.activeId!==s.activeId,n=e.open!==s.open;if(r||o||n){const l={value:a,activeId:s.activeId,open:s.open};this.dispatchInput(l),r&&this.dispatchChange(l)}o&&this.focusActiveItem(),s.restoreTargetId&&this.shadowRoot?.querySelector(`[id="${s.restoreTargetId}"]`)?.focus()}syncOutsidePointerListener(e=!1){!e&&this.open?document.addEventListener("pointerdown",this.handleDocumentPointerDown):document.removeEventListener("pointerdown",this.handleDocumentPointerDown)}handleDocumentPointerDown=e=>{if(!this.model||!this.model.state.isOpen()||e.composedPath().includes(this))return;const s=this.captureState();this.model.actions.handleOutsidePointer(),this.applyInteractionResult(s)};handleItemClick(e){if(!this.model)return;const t=this.itemRecords.find(a=>a.id===e);if(!t||t.disabled)return;const s=this.captureState();this.model.actions.select(e),this.applyInteractionResult(s,e)}handleTriggerClick(){if(this.disabled||!this.model)return;const e=this.captureState();this.model.contracts.getTriggerProps().onClick(),this.applyInteractionResult(e)}handleActionClick(){this.disabled||this.dispatchAction()}handleDropdownClick(){if(this.disabled||!this.model)return;const e=this.captureState();this.model.contracts.getTriggerProps().onClick(),this.applyInteractionResult(e)}handleKeyDown(e){if(!this.model)return;Ml.has(e.key)&&e.preventDefault();const t=this.captureState(),s=this.model.state.isOpen()&&(e.key==="Enter"||e.key===" "||e.key==="Spacebar")?this.model.state.activeId():t.value;this.model.actions.handleKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(t,s)}handleMenuSlotChange(){this.rebuildModelFromSlot(!0,!0)}handleContentSlotChange(){this.syncContentParts()&&this.requestUpdate()}renderDropdownIcon(){return q`<span part="dropdown-icon" aria-hidden="true"
      ><svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg></span
    >`}renderSplitMode(){const e=this.model?.contracts.getTriggerProps(),t=this.model?.contracts.getMenuProps()??{id:`${this.idBase}-menu`,role:"menu",tabindex:"-1","aria-label":this.ariaLabel||void 0,hidden:!this.open};return q`
      <div part="base">
        <button
          type="button"
          part="action"
          ?disabled=${this.disabled}
          @click=${this.handleActionClick}
        >
          <span part="prefix" ?hidden=${!this.hasPrefixContent}
            ><slot name="prefix" @slotchange=${this.handleContentSlotChange}></slot
          ></span>
          <span part="label" ?hidden=${!this.hasLabelContent}
            ><slot @slotchange=${this.handleContentSlotChange}></slot
          ></span>
          <span part="suffix" ?hidden=${!this.hasSuffixContent}
            ><slot name="suffix" @slotchange=${this.handleContentSlotChange}></slot
          ></span>
        </button>

        <button
          id=${e?.id??`${this.idBase}-trigger`}
          type="button"
          part="dropdown"
          tabindex=${e?.tabindex??"0"}
          aria-haspopup=${e?.["aria-haspopup"]??"menu"}
          aria-expanded=${e?.["aria-expanded"]??(this.open?"true":"false")}
          aria-controls=${e?.["aria-controls"]??`${this.idBase}-menu`}
          aria-label=${e?.["aria-label"]??"More options"}
          ?disabled=${this.disabled}
          @click=${this.handleDropdownClick}
          @keydown=${this.handleKeyDown}
        >
          ${this.renderDropdownIcon()}
        </button>

        <div
          id=${t.id}
          role=${t.role}
          tabindex=${t.tabindex}
          aria-label=${t["aria-label"]??y}
          ?hidden=${t.hidden}
          part="menu"
          @keydown=${this.handleKeyDown}
        >
          <slot name="menu" @slotchange=${this.handleMenuSlotChange}></slot>
        </div>
      </div>
    `}renderStandardMode(){const e=this.model?.contracts.getTriggerProps()??{id:`${this.idBase}-trigger`,role:"button",tabindex:"0","aria-haspopup":"menu","aria-expanded":this.open?"true":"false","aria-controls":`${this.idBase}-menu`,"aria-label":this.ariaLabel||void 0},t=this.model?.contracts.getMenuProps()??{id:`${this.idBase}-menu`,role:"menu",tabindex:"-1","aria-label":this.ariaLabel||void 0,hidden:!this.open};return q`
      <div part="base">
        <button
          id=${e.id}
          role=${e.role}
          tabindex=${e.tabindex}
          aria-haspopup=${e["aria-haspopup"]}
          aria-expanded=${e["aria-expanded"]}
          aria-controls=${e["aria-controls"]}
          aria-label=${e["aria-label"]??y}
          type="button"
          part="trigger"
          ?disabled=${this.disabled}
          @click=${this.handleTriggerClick}
          @keydown=${this.handleKeyDown}
        >
          <span part="prefix" ?hidden=${!this.hasPrefixContent}
            ><slot name="prefix" @slotchange=${this.handleContentSlotChange}></slot
          ></span>
          <span part="label" ?hidden=${!this.hasLabelContent}
            ><slot @slotchange=${this.handleContentSlotChange}></slot
          ></span>
          <span part="suffix" ?hidden=${!this.hasSuffixContent}
            ><slot name="suffix" @slotchange=${this.handleContentSlotChange}></slot
          ></span>
          ${this.renderDropdownIcon()}
        </button>

        <div
          id=${t.id}
          role=${t.role}
          tabindex=${t.tabindex}
          aria-label=${t["aria-label"]??y}
          ?hidden=${t.hidden}
          part="menu"
          @keydown=${this.handleKeyDown}
        >
          <slot name="menu" @slotchange=${this.handleMenuSlotChange}></slot>
        </div>
      </div>
    `}render(){return this.split?this.renderSplitMode():this.renderStandardMode()}}let Bl=0;class Pl extends de{static elementName="cv-meter";static get properties(){return{value:{type:Number,reflect:!0},min:{type:Number,reflect:!0},max:{type:Number,reflect:!0},low:{type:Number,reflect:!0},high:{type:Number,reflect:!0},optimum:{type:Number,reflect:!0},valueText:{type:String,attribute:"value-text"},ariaLabel:{type:String,attribute:"aria-label"},ariaLabelledBy:{type:String,attribute:"aria-labelledby"},ariaDescribedBy:{type:String,attribute:"aria-describedby"}}}idBase=`cv-meter-${++Bl}`;model;constructor(){super(),this.value=0,this.min=0,this.max=100,this.low=null,this.high=null,this.optimum=null,this.valueText="",this.ariaLabel="",this.ariaLabelledBy="",this.ariaDescribedBy="",this.model=this.createModel()}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        position: relative;
        inline-size: 100%;
        block-size: var(--cv-meter-height, 10px);
        border-radius: var(--cv-meter-border-radius, 999px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        overflow: hidden;
      }

      [part='indicator'] {
        block-size: 100%;
        inline-size: var(--cv-meter-width, 0%);
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--cv-color-primary, #65d7ff) 0%,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 70%, white) 100%
        );
        transition: inline-size var(--cv-meter-transition-duration, var(--cv-duration-normal, 220ms)) var(--cv-easing-standard, ease);
      }

      [part='indicator'][data-status='low'] {
        background: linear-gradient(
          90deg,
          var(--cv-meter-suboptimum-color, var(--cv-color-warning, #ffbe65)) 0%,
          color-mix(in oklab, var(--cv-meter-suboptimum-color, var(--cv-color-warning, #ffbe65)) 72%, white) 100%
        );
      }

      [part='indicator'][data-status='high'] {
        background: linear-gradient(
          90deg,
          var(--cv-meter-danger-color, var(--cv-color-danger, #ff7a8a)) 0%,
          color-mix(in oklab, var(--cv-meter-danger-color, var(--cv-color-danger, #ff7a8a)) 72%, white) 100%
        );
      }

      [part='indicator'][data-status='optimum'] {
        background: linear-gradient(
          90deg,
          var(--cv-meter-optimum-color, var(--cv-color-success, #6ef7c8)) 0%,
          color-mix(in oklab, var(--cv-meter-optimum-color, var(--cv-color-success, #6ef7c8)) 72%, white) 100%
        );
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}willUpdate(e){if(super.willUpdate(e),e.has("min")||e.has("max")||e.has("low")||e.has("high")||e.has("optimum")||e.has("valueText")||e.has("ariaLabel")||e.has("ariaLabelledBy")||e.has("ariaDescribedBy")){this.model=this.createModel();return}e.has("value")&&this.model.state.value()!==this.value&&this.model.actions.setValue(this.value)}createModel(){return uo({idBase:this.idBase,value:this.value,min:this.min,max:this.max,low:this.toFiniteOrUndefined(this.low),high:this.toFiniteOrUndefined(this.high),optimum:this.toFiniteOrUndefined(this.optimum),ariaLabel:this.ariaLabel||void 0,ariaLabelledBy:this.ariaLabelledBy||void 0,ariaDescribedBy:this.ariaDescribedBy||void 0,formatValueText:this.valueText?()=>this.valueText:void 0})}toFiniteOrUndefined(e){return typeof e=="number"&&Number.isFinite(e)?e:void 0}render(){const e=this.model.contracts.getMeterProps(),t=Math.max(0,Math.min(100,this.model.state.percentage())),s=this.model.state.status();return q`
      <div
        id=${e.id}
        role=${e.role}
        aria-valuenow=${e["aria-valuenow"]}
        aria-valuemin=${e["aria-valuemin"]}
        aria-valuemax=${e["aria-valuemax"]}
        aria-valuetext=${e["aria-valuetext"]??y}
        aria-label=${e["aria-label"]??y}
        aria-labelledby=${e["aria-labelledby"]??y}
        aria-describedby=${e["aria-describedby"]??y}
        part="base"
      >
        <div part="indicator" data-status=${s} style=${`--cv-meter-width:${t}%;`}><span part="label"><slot></slot></span></div>
      </div>
    `}}let Fl=0;class nd extends Le{static elementName="cv-number";static get properties(){return{value:{type:Number},defaultValue:{type:Number,attribute:"default-value"},min:{type:Number},max:{type:Number},step:{type:Number},largeStep:{type:Number,attribute:"large-step"},name:{type:String},disabled:{type:Boolean,reflect:!0},readOnly:{type:Boolean,attribute:"read-only",reflect:!0},required:{type:Boolean,reflect:!0},clearable:{type:Boolean,reflect:!0},stepper:{type:Boolean,reflect:!0},placeholder:{type:String},size:{type:String,reflect:!0},variant:{type:String,reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},ariaLabelledBy:{type:String,attribute:"aria-labelledby"},ariaDescribedBy:{type:String,attribute:"aria-describedby"}}}idBase=`cv-number-${++Fl}`;model;modelInitialized=!1;_valueOnFocus=null;constructor(){super(),this.value=0,this.defaultValue=void 0,this.min=void 0,this.max=void 0,this.step=1,this.largeStep=10,this.name="",this.disabled=!1,this.readOnly=!1,this.required=!1,this.clearable=!1,this.stepper=!1,this.placeholder="",this.size="medium",this.variant="outlined",this.ariaLabel="",this.ariaLabelledBy="",this.ariaDescribedBy=""}static styles=[Q`
      :host {
        display: inline-block;
        --cv-number-height: 36px;
        --cv-number-padding-inline: var(--cv-space-3, 12px);
        --cv-number-font-size: var(--cv-font-size-base, 14px);
        --cv-number-border-radius: var(--cv-radius-sm, 6px);
        --cv-number-border-color: var(--cv-color-border, #2a3245);
        --cv-number-background: transparent;
        --cv-number-color: var(--cv-color-text, #e8ecf6);
        --cv-number-placeholder-color: var(--cv-color-text-muted, #6b7a99);
        --cv-number-focus-ring: 0 0 0 2px var(--cv-color-primary, #65d7ff);
        --cv-number-icon-size: 1em;
        --cv-number-gap: var(--cv-space-2, 8px);
        --cv-number-transition-duration: var(--cv-duration-fast, 120ms);
        --cv-number-stepper-width: 24px;
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-number-gap);
        padding-inline: var(--cv-number-padding-inline);
        height: var(--cv-number-height);
        font-size: var(--cv-number-font-size);
        border-radius: var(--cv-number-border-radius);
        border: 1px solid var(--cv-number-border-color);
        background: var(--cv-number-background);
        color: var(--cv-number-color);
        cursor: text;
        transition:
          border-color var(--cv-number-transition-duration) var(--cv-easing-standard, ease),
          background var(--cv-number-transition-duration) var(--cv-easing-standard, ease),
          box-shadow var(--cv-number-transition-duration) var(--cv-easing-standard, ease);
        box-sizing: border-box;
        width: 100%;
      }

      [part='input'] {
        flex: 1;
        min-width: 0;
        border: none;
        outline: none;
        background: transparent;
        color: inherit;
        font: inherit;
        padding: 0;
        margin: 0;
        font-variant-numeric: tabular-nums;
      }

      [part='input']::placeholder {
        color: var(--cv-number-placeholder-color);
      }

      [part='prefix'],
      [part='suffix'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: var(--cv-number-icon-size);
      }

      [part='clear-button'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: var(--cv-number-icon-size);
        user-select: none;
      }

      [part='clear-button'][hidden] {
        display: none;
      }

      [part='stepper'] {
        display: inline-flex;
        flex-direction: column;
        gap: 1px;
      }

      [part='stepper'][hidden] {
        display: none;
      }

      [part='increment'],
      [part='decrement'] {
        width: var(--cv-number-stepper-width);
        border-radius: 4px;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
        padding: 0;
        line-height: 1;
        cursor: pointer;
      }

      [part='form-control-label'] {
        display: block;
      }

      [part='form-control-help-text'] {
        display: block;
      }

      /* --- variant: outlined (default) --- */
      :host([variant='outlined']) [part='base'] {
        border-color: var(--cv-number-border-color);
        background: var(--cv-number-background);
      }

      /* --- variant: filled --- */
      :host([variant='filled']) [part='base'] {
        background: var(--cv-color-surface, #141923);
        border-color: transparent;
      }

      /* --- focused --- */
      :host([focused]) [part='base'] {
        box-shadow: var(--cv-number-focus-ring);
      }

      /* --- sizes --- */
      :host([size='small']) {
        --cv-number-height: 30px;
        --cv-number-padding-inline: var(--cv-space-2, 8px);
        --cv-number-font-size: var(--cv-font-size-sm, 13px);
      }

      :host([size='large']) {
        --cv-number-height: 42px;
        --cv-number-padding-inline: var(--cv-space-4, 16px);
        --cv-number-font-size: var(--cv-font-size-md, 16px);
      }

      /* --- disabled --- */
      :host([disabled]) {
        pointer-events: none;
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
        cursor: not-allowed;
      }

      :host([disabled]) [part='input'] {
        cursor: not-allowed;
      }

      /* --- read-only --- */
      :host([read-only]) [part='base'] {
        cursor: default;
      }

      :host([read-only]) [part='input'] {
        cursor: default;
      }

      /* --- required --- */
      :host([required]) {
        /* No default visual change; stylable via part selectors */
      }

      /* --- clearable --- */
      :host([clearable]) {
        /* Clear button space reserved in layout */
      }

      /* --- stepper --- */
      :host([stepper]) {
        /* Stepper buttons rendered and visible */
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}isEffectivelyDisabled(){return this.disabled||this.formDisabled}isFormAssociatedDisabled(){return this.isEffectivelyDisabled()}getFormAssociatedValue(){return this.modelInitialized?String(this.model.state.value()):String(this.value)}toFiniteOrUndefined(e){return typeof e=="number"&&Number.isFinite(e)?e:void 0}createModel(){return un({idBase:this.idBase,value:this.value,defaultValue:this.toFiniteOrUndefined(this.defaultValue),min:this.toFiniteOrUndefined(this.min),max:this.toFiniteOrUndefined(this.max),step:this.step,largeStep:this.largeStep,disabled:this.isEffectivelyDisabled(),readonly:this.readOnly,required:this.required,clearable:this.clearable,stepper:this.stepper,placeholder:this.placeholder,ariaLabel:this.ariaLabel||void 0,ariaLabelledBy:this.ariaLabelledBy||void 0,ariaDescribedBy:this.ariaDescribedBy||void 0,onClear:()=>{this.syncValueFromModel(),this.dispatchEvent(new CustomEvent("cv-clear",{detail:{},bubbles:!0,composed:!0}))}})}ensureModel(){this.modelInitialized||(this.model=this.createModel(),this.modelInitialized=!0)}willUpdate(e){if(super.willUpdate(e),!this.modelInitialized){this.ensureModel(),this.syncValueFromModel(),this.reflectHostAttributes(),this.syncFormAssociatedState();return}if(e.has("min")||e.has("max")||e.has("step")||e.has("largeStep")||e.has("defaultValue")||e.has("ariaLabel")||e.has("ariaLabelledBy")||e.has("ariaDescribedBy")){this.model=this.createModel(),this.syncValueFromModel(),this.syncFormAssociatedState(),this.reflectHostAttributes();return}e.has("value")&&this.model.state.value()!==this.value&&(this.model.actions.setValue(this.value),this.syncValueFromModel()),e.has("disabled")&&this.model.actions.setDisabled(this.isEffectivelyDisabled()),e.has("readOnly")&&this.model.actions.setReadOnly(this.readOnly),e.has("required")&&this.model.actions.setRequired(this.required),e.has("clearable")&&this.model.actions.setClearable(this.clearable),e.has("stepper")&&this.model.actions.setStepper(this.stepper),e.has("placeholder")&&this.model.actions.setPlaceholder(this.placeholder),this.reflectHostAttributes(),this.syncFormAssociatedState()}reflectHostAttributes(){this.toggleAttribute("focused",this.model.state.focused()),this.toggleAttribute("filled",this.model.state.filled())}syncValueFromModel(){const e=this.model.state.value();this.value!==e&&(this.value=e)}onFormDisabledChanged(e){this.modelInitialized&&this.model.actions.setDisabled(this.isEffectivelyDisabled())}onFormReset(){if(!this.modelInitialized)return;const e=this.model.state.defaultValue();this.model.actions.setValue(e),this.syncValueFromModel()}onFormStateRestore(e){if(typeof e!="string"||!this.modelInitialized)return;const t=Number(e);Number.isFinite(t)&&(this.model.actions.setValue(t),this.syncValueFromModel())}get type(){return"cv-number"}focus(e){const t=this.shadowRoot?.querySelector('[part="input"]');if(t){t.focus(e);return}super.focus(e)}select(){this.shadowRoot?.querySelector('[part="input"]')?.select()}handleNativeInput(e){const t=e.target;this.model.actions.handleInput(t.value),this.requestUpdate()}handleNativeFocus(){this._valueOnFocus=this.model.state.value(),this.model.actions.setFocused(!0),this.requestUpdate(),this.dispatchEvent(new CustomEvent("cv-focus",{detail:{},bubbles:!0,composed:!0}))}handleNativeBlur(){this.model.actions.setFocused(!1),this.syncValueFromModel(),this.requestUpdate(),this.dispatchEvent(new CustomEvent("cv-blur",{detail:{},bubbles:!0,composed:!0}));const e=this.model.state.value();this._valueOnFocus!==null&&e!==this._valueOnFocus&&this.dispatchEvent(new CustomEvent("cv-change",{detail:{value:e},bubbles:!0,composed:!0})),this._valueOnFocus=null}handleNativeKeyDown(e){const t=this.model.state.value();this.model.actions.handleKeyDown(e),this.syncValueFromModel(),this.requestUpdate();const s=this.model.state.value();e.key==="Enter"?s!==t&&this.dispatchEvent(new CustomEvent("cv-change",{detail:{value:s},bubbles:!0,composed:!0})):(e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="PageUp"||e.key==="PageDown"||e.key==="Home"||e.key==="End")&&s!==t&&this.dispatchEvent(new CustomEvent("cv-change",{detail:{value:s},bubbles:!0,composed:!0}))}handleIncrementClick(){const e=this.model.state.value();this.model.actions.increment(),this.syncValueFromModel(),this.requestUpdate();const t=this.model.state.value();t!==e&&this.dispatchEvent(new CustomEvent("cv-change",{detail:{value:t},bubbles:!0,composed:!0}))}handleDecrementClick(){const e=this.model.state.value();this.model.actions.decrement(),this.syncValueFromModel(),this.requestUpdate();const t=this.model.state.value();t!==e&&this.dispatchEvent(new CustomEvent("cv-change",{detail:{value:t},bubbles:!0,composed:!0}))}handleClearClick(){this.model.actions.clear(),this.syncValueFromModel(),this.requestUpdate()}render(){this.ensureModel();const e=this.model.contracts.getInputProps(),t=this.model.contracts.getIncrementButtonProps(),s=this.model.contracts.getDecrementButtonProps(),a=this.model.contracts.getClearButtonProps(),r=this.model.state.draftText(),o=r!==null?r:String(this.model.state.value());return q`
      <span part="form-control-label"><slot name="label"></slot></span>
      <div part="base">
        <span part="prefix"><slot name="prefix"></slot></span>
        <input
          part="input"
          id=${e.id}
          role=${e.role}
          tabindex=${e.tabindex}
          inputmode=${e.inputmode}
          aria-valuenow=${e["aria-valuenow"]}
          aria-valuemin=${e["aria-valuemin"]??y}
          aria-valuemax=${e["aria-valuemax"]??y}
          aria-valuetext=${e["aria-valuetext"]??y}
          aria-disabled=${e["aria-disabled"]??y}
          aria-readonly=${e["aria-readonly"]??y}
          aria-required=${e["aria-required"]??y}
          aria-label=${e["aria-label"]??y}
          aria-labelledby=${e["aria-labelledby"]??y}
          aria-describedby=${e["aria-describedby"]??y}
          placeholder=${e.placeholder??y}
          autocomplete=${e.autocomplete}
          .value=${o}
          @input=${this.handleNativeInput}
          @focus=${this.handleNativeFocus}
          @blur=${this.handleNativeBlur}
          @keydown=${this.handleNativeKeyDown}
        />
        <span
          part="clear-button"
          role=${a.role}
          aria-label=${a["aria-label"]}
          tabindex=${a.tabindex}
          ?hidden=${a.hidden}
          aria-hidden=${a["aria-hidden"]??y}
          @click=${this.handleClearClick}
        >
          <slot name="clear-icon">&times;</slot>
        </span>
        <span
          part="stepper"
          ?hidden=${t.hidden}
          aria-hidden=${t["aria-hidden"]??y}
        >
          <button
            part="increment"
            type="button"
            id=${t.id}
            tabindex=${t.tabindex}
            aria-label=${t["aria-label"]}
            aria-disabled=${t["aria-disabled"]??y}
            ?hidden=${t.hidden}
            aria-hidden=${t["aria-hidden"]??y}
            @click=${this.handleIncrementClick}
          >
            +
          </button>
          <button
            part="decrement"
            type="button"
            id=${s.id}
            tabindex=${s.tabindex}
            aria-label=${s["aria-label"]}
            aria-disabled=${s["aria-disabled"]??y}
            ?hidden=${s.hidden}
            aria-hidden=${s["aria-hidden"]??y}
            @click=${this.handleDecrementClick}
          >
            -
          </button>
        </span>
        <span part="suffix"><slot name="suffix"></slot></span>
      </div>
      <span part="form-control-help-text"><slot name="help-text"></slot></span>
    `}}const Nl=new Set(["Enter"," ","Spacebar","ArrowDown"]),Vl=typeof HTMLElement<"u"&&typeof HTMLElement.prototype.showPopover=="function";let zl=0;class Kl extends de{static elementName="cv-popover";static get properties(){return{open:{type:Boolean,reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},ariaLabelledBy:{type:String,attribute:"aria-labelledby"},closeOnEscape:{type:Boolean,attribute:"close-on-escape",reflect:!0},closeOnOutsidePointer:{type:Boolean,attribute:"close-on-outside-pointer",reflect:!0},closeOnOutsideFocus:{type:Boolean,attribute:"close-on-outside-focus",reflect:!0},placement:{type:String,reflect:!0},anchor:{type:String,reflect:!0},offset:{type:Number,reflect:!0},arrow:{type:Boolean,reflect:!0}}}idBase=`cv-popover-${++zl}`;model;previousOpen=!1;constructor(){super(),this.open=!1,this.ariaLabel="",this.ariaLabelledBy="",this.closeOnEscape=!0,this.closeOnOutsidePointer=!0,this.closeOnOutsideFocus=!0,this.placement="bottom-start",this.anchor="trigger",this.offset=4,this.arrow=!1,this.model=this.createModel(),this.previousOpen=this.model.state.isOpen()}static styles=[Q`
      :host {
        display: inline-block;
      }

      [part='base'] {
        position: relative;
        display: inline-grid;
        gap: var(--cv-space-1, 4px);
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 36px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='content'] {
        position: absolute;
        inset-inline-start: 0;
        inset-block-start: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        z-index: var(--cv-popover-z-index, 20);
        min-inline-size: var(--cv-popover-min-inline-size, max(220px, 100%));
        max-inline-size: var(--cv-popover-max-inline-size, min(560px, calc(100vw - 32px)));
        display: grid;
        gap: var(--cv-space-2, 8px);
        padding: var(--cv-popover-padding, var(--cv-space-3, 12px));
        border-radius: var(--cv-popover-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        box-shadow: var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24));
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='content'][hidden] {
        display: none;
      }

      [part='content']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='content'][data-placement='bottom'] {
        inset-inline-start: 50%;
        transform: translateX(-50%);
      }

      [part='content'][data-placement='bottom-end'] {
        inset-inline-start: auto;
        inset-inline-end: 0;
      }

      [part='content'][data-placement='top-start'] {
        inset-block-start: auto;
        inset-block-end: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
      }

      [part='content'][data-placement='top'] {
        inset-inline-start: 50%;
        inset-block-start: auto;
        inset-block-end: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        transform: translateX(-50%);
      }

      [part='content'][data-placement='top-end'] {
        inset-inline-start: auto;
        inset-inline-end: 0;
        inset-block-start: auto;
        inset-block-end: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
      }

      [part='content'][data-placement='right-start'] {
        inset-inline-start: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        inset-block-start: 0;
      }

      [part='content'][data-placement='right'] {
        inset-inline-start: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        inset-block-start: 50%;
        transform: translateY(-50%);
      }

      [part='content'][data-placement='right-end'] {
        inset-inline-start: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        inset-block-start: auto;
        inset-block-end: 0;
      }

      [part='content'][data-placement='left-start'] {
        inset-inline-start: auto;
        inset-inline-end: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        inset-block-start: 0;
      }

      [part='content'][data-placement='left'] {
        inset-inline-start: auto;
        inset-inline-end: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        inset-block-start: 50%;
        transform: translateY(-50%);
      }

      [part='content'][data-placement='left-end'] {
        inset-inline-start: auto;
        inset-inline-end: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        inset-block-start: auto;
        inset-block-end: 0;
      }

      [part='content'][data-anchor='host'] {
        min-inline-size: min(560px, calc(100vw - 32px));
      }

      [part='arrow'] {
        position: absolute;
        display: block;
        inline-size: var(--cv-popover-arrow-size, 8px);
        block-size: var(--cv-popover-arrow-size, 8px);
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.syncOutsideListeners()}disconnectedCallback(){super.disconnectedCallback(),this.syncOutsideListeners(!0)}willUpdate(e){if(super.willUpdate(e),e.has("ariaLabel")||e.has("ariaLabelledBy")||e.has("closeOnEscape")||e.has("closeOnOutsidePointer")||e.has("closeOnOutsideFocus")){const t=this.model.state.isOpen();this.model=this.createModel(t),this.previousOpen=t}e.has("open")&&this.model.state.isOpen()!==this.open&&(this.open?this.model.actions.open("programmatic"):this.model.actions.close("programmatic"),this.open=this.model.state.isOpen(),this.previousOpen=this.open)}updated(e){super.updated(e),this.syncOutsideListeners()}createModel(e=this.open){return Zo({idBase:this.idBase,initialOpen:e,ariaLabel:this.ariaLabel||void 0,ariaLabelledBy:this.ariaLabelledBy||void 0,closeOnEscape:this.closeOnEscape,closeOnOutsidePointer:this.closeOnOutsidePointer,closeOnOutsideFocus:this.closeOnOutsideFocus,useNativePopover:Vl})}buildEventDetail(){return{open:this.model.state.isOpen(),openedBy:this.model.state.openedBy(),dismissIntent:this.model.state.lastDismissIntent()}}emitToggleEvents(){const e=this.model.state.isOpen();if(e===this.previousOpen)return;const t=this.buildEventDetail(),s=t.open,a=new CustomEvent("beforetoggle",{detail:t,bubbles:!0,composed:!0,cancelable:s});if(this.dispatchEvent(a),s&&a.defaultPrevented){this.model.actions.close("programmatic"),this.open=!1,this.previousOpen=!1;return}if(this.open=e,this.previousOpen=e,this.dispatchEvent(new CustomEvent("toggle",{detail:t,bubbles:!1,composed:!0,cancelable:!1})),!e){const r=this.model.state.restoreTargetId();r&&this.shadowRoot?.querySelector(`[id="${r}"]`)?.focus()}}syncOutsideListeners(e=!1){!e&&this.model.state.isOpen()?(document.addEventListener("pointerdown",this.handleDocumentPointerDown),document.addEventListener("focusin",this.handleDocumentFocusIn)):(document.removeEventListener("pointerdown",this.handleDocumentPointerDown),document.removeEventListener("focusin",this.handleDocumentFocusIn))}handleDocumentPointerDown=e=>{!this.model||!this.model.state.isOpen()||e.composedPath().includes(this)||(this.model.contracts.getContentProps().onPointerDownOutside(),this.emitToggleEvents(),this.syncOutsideListeners())};handleDocumentFocusIn=e=>{!this.model||!this.model.state.isOpen()||e.composedPath().includes(this)||(this.model.contracts.getContentProps().onFocusOutside(),this.emitToggleEvents(),this.syncOutsideListeners())};handleTriggerClick(){this.model.contracts.getTriggerProps().onClick(),this.emitToggleEvents(),this.syncOutsideListeners()}handleTriggerKeyDown(e){Nl.has(e.key)&&e.preventDefault(),this.model.contracts.getTriggerProps().onKeyDown({key:e.key}),this.emitToggleEvents(),this.syncOutsideListeners()}handleContentKeyDown(e){e.key==="Escape"&&e.preventDefault(),this.model.contracts.getContentProps().onKeyDown({key:e.key}),this.emitToggleEvents(),this.syncOutsideListeners()}render(){const e=this.model.contracts.getTriggerProps(),t=this.model.contracts.getContentProps();return q`
      <div part="base">
        <button
          id=${e.id}
          role=${e.role}
          tabindex=${e.tabindex}
          aria-haspopup=${e["aria-haspopup"]}
          aria-expanded=${e["aria-expanded"]}
          aria-controls=${e["aria-controls"]}
          part="trigger"
          type="button"
          @click=${this.handleTriggerClick}
          @keydown=${this.handleTriggerKeyDown}
        >
          <slot name="trigger">Open popover</slot>
        </button>

        <div
          id=${t.id}
          role=${t.role}
          tabindex=${t.tabindex}
          aria-modal=${t["aria-modal"]}
          aria-label=${t["aria-label"]??y}
          aria-labelledby=${t["aria-labelledby"]??y}
          ?hidden=${t.hidden}
          data-placement=${this.placement}
          data-anchor=${this.anchor}
          style=${`--cv-popover-offset:${this.offset}px;`}
          part="content"
          @keydown=${this.handleContentKeyDown}
        >
          <slot></slot>
          ${this.arrow?q`<span part="arrow"><slot name="arrow"></slot></span>`:y}
        </div>
      </div>
    `}}let _l=0;class Ul extends de{static elementName="cv-progress";static get properties(){return{value:{type:Number,reflect:!0},min:{type:Number,reflect:!0},max:{type:Number,reflect:!0},indeterminate:{type:Boolean,reflect:!0},valueText:{type:String,attribute:"value-text"},ariaLabel:{type:String,attribute:"aria-label"}}}idBase=`cv-progress-${++_l}`;model;constructor(){super(),this.value=0,this.min=0,this.max=100,this.indeterminate=!1,this.valueText="",this.ariaLabel="",this.model=this.createModel()}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        position: relative;
        inline-size: 100%;
        block-size: var(--cv-progress-height, 10px);
        border-radius: 999px;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-progress-track-color, var(--cv-color-surface, #141923));
        overflow: hidden;
      }

      [part='indicator'] {
        block-size: 100%;
        inline-size: var(--cv-progress-width, 0%);
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--cv-progress-indicator-color, var(--cv-color-primary, #65d7ff)) 0%,
          color-mix(in oklab, var(--cv-progress-indicator-color, var(--cv-color-primary, #65d7ff)) 70%, white) 100%
        );
        transition: inline-size var(--cv-duration-normal, 220ms) var(--cv-easing-standard, ease);
        position: relative;
      }

      [part='label'] {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--cv-progress-label-color, var(--cv-color-text, #e8ecf6));
      }

      :host([indeterminate]) [part='indicator'] {
        inline-size: 35%;
        animation: cv-progress-indeterminate 1.15s linear infinite;
      }

      :host([data-complete]) [part='indicator'] {
        background: linear-gradient(
          90deg,
          var(--cv-color-success, #6ef7c8) 0%,
          color-mix(in oklab, var(--cv-color-success, #6ef7c8) 70%, white) 100%
        );
      }

      @keyframes cv-progress-indeterminate {
        0% {
          transform: translateX(-120%);
        }
        100% {
          transform: translateX(320%);
        }
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}willUpdate(e){if(super.willUpdate(e),e.has("min")||e.has("max")||e.has("valueText")||e.has("ariaLabel")){this.model=this.createModel();return}e.has("value")&&this.model.state.value()!==this.value&&this.model.actions.setValue(this.value),e.has("indeterminate")&&this.model.actions.setIndeterminate(this.indeterminate)}createModel(){return Aa({idBase:this.idBase,value:this.value,min:this.min,max:this.max,isIndeterminate:this.indeterminate,valueText:this.valueText||void 0,ariaLabel:this.ariaLabel||void 0})}render(){const e=this.model.contracts.getProgressProps(),t=Math.max(0,Math.min(100,this.model.state.percentage())),s=this.model.state.isComplete();return this.toggleAttribute("data-complete",s),q`
      <div
        id=${e.id}
        role=${e.role}
        aria-valuenow=${e["aria-valuenow"]??y}
        aria-valuemin=${e["aria-valuemin"]??y}
        aria-valuemax=${e["aria-valuemax"]??y}
        aria-valuetext=${e["aria-valuetext"]??y}
        aria-label=${e["aria-label"]??y}
        aria-labelledby=${e["aria-labelledby"]??y}
        aria-describedby=${e["aria-describedby"]??y}
        part="base"
      >
        <div
          part="indicator"
          style=${this.indeterminate?y:`--cv-progress-width:${t}%;`}
        ><span part="label"><slot></slot></span></div>
      </div>
    `}}let ql=0;const gs=45,rs=2*Math.PI*gs;class Hl extends de{static elementName="cv-progress-ring";static get properties(){return{value:{type:Number,reflect:!0},min:{type:Number,reflect:!0},max:{type:Number,reflect:!0},indeterminate:{type:Boolean,reflect:!0},valueText:{type:String,attribute:"value-text"},ariaLabel:{type:String,attribute:"aria-label"}}}idBase=`cv-progress-ring-${++ql}`;model;constructor(){super(),this.value=0,this.min=0,this.max=100,this.indeterminate=!1,this.valueText="",this.ariaLabel="",this.model=this.createModel()}static styles=[Q`
      :host {
        display: inline-block;
        position: relative;
        inline-size: var(--cv-progress-ring-size, 80px);
        block-size: var(--cv-progress-ring-size, 80px);
      }

      [part='base'] {
        position: relative;
        inline-size: 100%;
        block-size: 100%;
      }

      [part='svg'] {
        inline-size: 100%;
        block-size: 100%;
        transform: rotate(-90deg);
      }

      [part='track'] {
        fill: none;
        stroke: var(--cv-progress-ring-track-color, var(--cv-color-surface, #141923));
        stroke-width: var(--cv-progress-ring-track-width, 4px);
      }

      [part='indicator'] {
        fill: none;
        stroke: var(--cv-progress-ring-indicator-color, var(--cv-color-primary, #65d7ff));
        stroke-width: var(--cv-progress-ring-indicator-width, 4px);
        stroke-linecap: round;
        transition: stroke-dashoffset var(--cv-duration-normal, 220ms) var(--cv-easing-standard, ease);
      }

      [part='label'] {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--cv-progress-ring-label-color, var(--cv-color-text, #e8ecf6));
      }

      :host([indeterminate]) [part='svg'] {
        animation: cv-progress-ring-spin 1.15s linear infinite;
      }

      :host([indeterminate]) [part='indicator'] {
        transition: none;
      }

      :host([data-complete]) [part='indicator'] {
        stroke: var(--cv-color-success, #6ef7c8);
      }

      @keyframes cv-progress-ring-spin {
        0% {
          transform: rotate(-90deg);
        }
        100% {
          transform: rotate(270deg);
        }
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}willUpdate(e){if(super.willUpdate(e),e.has("min")||e.has("max")||e.has("valueText")||e.has("ariaLabel")){this.model=this.createModel();return}e.has("value")&&this.model.state.value()!==this.value&&this.model.actions.setValue(this.value),e.has("indeterminate")&&this.model.actions.setIndeterminate(this.indeterminate)}createModel(){return Aa({idBase:this.idBase,value:this.value,min:this.min,max:this.max,isIndeterminate:this.indeterminate,valueText:this.valueText||void 0,ariaLabel:this.ariaLabel||void 0})}render(){const e=this.model.contracts.getProgressProps(),t=Math.max(0,Math.min(100,this.model.state.percentage())),s=this.model.state.isComplete(),a=this.model.state.isIndeterminate();this.toggleAttribute("data-complete",s);const r=a?rs*.75:rs*(1-t/100);return q`
      <div
        id=${e.id}
        role=${e.role}
        aria-valuenow=${e["aria-valuenow"]??y}
        aria-valuemin=${e["aria-valuemin"]??y}
        aria-valuemax=${e["aria-valuemax"]??y}
        aria-valuetext=${e["aria-valuetext"]??y}
        aria-label=${e["aria-label"]??y}
        aria-labelledby=${e["aria-labelledby"]??y}
        aria-describedby=${e["aria-describedby"]??y}
        part="base"
      >
        <svg part="svg" viewBox="0 0 100 100">
          <circle
            part="track"
            cx="50"
            cy="50"
            r="${gs}"
          ></circle>
          <circle
            part="indicator"
            cx="50"
            cy="50"
            r="${gs}"
            stroke-dasharray="${rs}"
            style="stroke-dashoffset: ${r};"
          ></circle>
        </svg>
        <span part="label"><slot></slot></span>
      </div>
    `}}class Ta extends ve{static elementName="cv-radio";static get properties(){return{value:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},checked:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0},size:{type:String,reflect:!0}}}constructor(){super(),this.value="",this.disabled=!1,this.checked=!1,this.active=!1,this.size="medium"}static styles=[Q`
      :host {
        display: inline-block;
        outline: none;
        --cv-radio-indicator-size: 20px;
        --cv-radio-dot-size: 8px;
        --cv-radio-gap: var(--cv-space-2, 8px);
      }

      :host([size='small']) {
        --cv-radio-indicator-size: 16px;
        --cv-radio-dot-size: 6px;
      }

      :host([size='large']) {
        --cv-radio-indicator-size: 24px;
        --cv-radio-dot-size: 10px;
      }

      :host([hidden]) {
        display: none;
      }

      .radio {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-radio-gap);
        min-block-size: 32px;
        padding: 0 var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-sm, 6px);
        color: var(--cv-color-text, #e8ecf6);
        transition: background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      .indicator {
        inline-size: var(--cv-radio-indicator-size);
        block-size: var(--cv-radio-indicator-size);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        transition:
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      .dot {
        inline-size: var(--cv-radio-dot-size);
        block-size: var(--cv-radio-dot-size);
        border-radius: 50%;
        background: var(--cv-color-primary, #65d7ff);
        transform: scale(0);
        transition: transform var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([active]) .radio {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 12%, transparent);
      }

      :host([checked]) .indicator {
        border-color: var(--cv-color-primary, #65d7ff);
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 20%, var(--cv-color-surface, #141923));
      }

      :host([checked]) .dot {
        transform: scale(1);
      }

      :host([disabled]) {
        opacity: 0.55;
        cursor: not-allowed;
      }

      :host(:focus-visible) .radio {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`
      <div class="radio" part="base">
        <span class="indicator" part="indicator">
          <span class="dot" part="dot"></span>
        </span>
        <span part="label"><slot></slot></span>
        <span part="description"><slot name="description"></slot></span>
      </div>
    `}}const jl=new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End"," ","Spacebar"]);let Gl=0;class Wl extends Le{static elementName="cv-radio-group";static get properties(){return{name:{type:String},value:{type:String,reflect:!0},orientation:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},required:{type:Boolean,reflect:!0},ariaLabel:{type:String,attribute:"aria-label"}}}idBase=`cv-radio-group-${++Gl}`;radioRecords=[];radioListeners=new WeakMap;model;defaultValue="";didCaptureDefaultValue=!1;constructor(){super(),this.name="",this.value="",this.orientation="horizontal",this.disabled=!1,this.required=!1,this.ariaLabel=""}static styles=[Q`
      :host {
        display: inline-block;
        --cv-radio-group-gap: var(--cv-space-2, 8px);
      }

      [part='base'] {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--cv-radio-group-gap);
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      :host([orientation='vertical']) [part='base'] {
        display: inline-grid;
        justify-items: start;
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      :host([disabled]) [part='base'] {
        opacity: 0.7;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.model||this.rebuildModelFromSlot(!1,!1),this.didCaptureDefaultValue||(this.defaultValue=this.model?.state.value()??"",this.didCaptureDefaultValue=!0),this.syncFormAssociatedState()}disconnectedCallback(){super.disconnectedCallback(),this.detachRadioListeners()}willUpdate(e){if(super.willUpdate(e),e.has("orientation")||e.has("ariaLabel")){this.rebuildModelFromSlot(!0,!1),this.syncFormAssociatedState();return}if(e.has("disabled")&&this.model?.actions.setDisabled(this.isEffectivelyDisabled()),e.has("value")&&this.model){const t=this.value.trim();if(t.length===0){this.restoreValue(null),this.syncFormAssociatedState();return}if(!new Set(this.radioRecords.filter(a=>!a.disabled).map(a=>a.id)).has(t)){this.syncFormAssociatedState();return}if(this.model.state.value()!==t){const a=this.model.state.value(),r=this.model.state.activeId();this.model.actions.select(t),this.applyInteractionResult(a,r)}}(e.has("value")||e.has("disabled")||e.has("required")||e.has("name"))&&this.syncFormAssociatedState()}updated(e){super.updated(e),e.has("value")||this.syncRadioElements(),(e.has("value")||e.has("disabled")||e.has("required")||e.has("name")||e.has("orientation")||e.has("ariaLabel"))&&this.syncFormAssociatedState()}getRadioElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===Ta.elementName)}ensureRadioValue(e,t){const s=e.value?.trim();if(s)return s;const a=`radio-${t+1}`;return e.value=a,a}resolveConfiguredValue(e){const t=this.value.trim();if(t.length>0)return t;for(const[s,a]of e.entries())if(a.checked&&!a.disabled)return this.ensureRadioValue(a,s);return null}rebuildModelFromSlot(e,t=!0){const s=this.getRadioElements(),a=this.resolveConfiguredValue(s),r=e?this.model?.state.value()??a:a,o=e?this.model?.state.activeId()??r:r;this.detachRadioListeners(),this.radioRecords=s.map((u,h)=>{const p=this.ensureRadioValue(u,h),v=u.textContent?.trim()||p,g=u.querySelector('[slot="description"]')!==null;return{id:p,label:v,disabled:u.disabled,hasDescription:g,element:u}});const n=new Set(this.radioRecords.filter(u=>!u.disabled).map(u=>u.id)),l=r&&n.has(r)?r:null,d=o&&n.has(o)?o:l??this.radioRecords.find(u=>!u.disabled)?.id??null;this.model=ko({idBase:this.idBase,items:this.radioRecords.map(u=>({id:u.id,disabled:u.disabled,describedBy:u.hasDescription?`${this.idBase}-radio-${u.id}-desc`:void 0})),orientation:this.orientation,isDisabled:this.isEffectivelyDisabled(),ariaLabel:this.ariaLabel||void 0,initialValue:l,initialActiveId:d}),this.attachRadioListeners(),this.syncRadioElements(),this.value=this.model.state.value()??"",t&&this.requestUpdate()}detachRadioListeners(){for(const e of this.radioRecords){const t=this.radioListeners.get(e.element);t&&(e.element.removeEventListener("click",t.click),e.element.removeEventListener("keydown",t.keydown),this.radioListeners.delete(e.element))}}attachRadioListeners(){if(this.model)for(const e of this.radioRecords){const t=()=>{this.handleRadioClick(e.id)},s=a=>{a.stopPropagation(),this.handleGroupKeyDown(a)};e.element.addEventListener("click",t),e.element.addEventListener("keydown",s),this.radioListeners.set(e.element,{click:t,keydown:s})}}syncRadioElements(){if(this.model)for(const e of this.radioRecords){const t=this.model.contracts.getRadioProps(e.id);e.element.id=t.id,e.element.setAttribute("role",t.role),e.element.setAttribute("tabindex",t.tabindex),e.element.setAttribute("aria-checked",t["aria-checked"]),t["aria-disabled"]?e.element.setAttribute("aria-disabled",t["aria-disabled"]):e.element.removeAttribute("aria-disabled"),t["aria-describedby"]?e.element.setAttribute("aria-describedby",t["aria-describedby"]):e.element.removeAttribute("aria-describedby"),t["data-active"]==="true"?(e.element.setAttribute("data-active","true"),e.element.active=!0):(e.element.removeAttribute("data-active"),e.element.active=!1),e.element.checked=t["aria-checked"]==="true",e.element.disabled=t["aria-disabled"]==="true"}}focusActiveRadio(){if(!this.model)return;const e=this.model.state.activeId();if(!e)return;this.radioRecords.find(s=>s.id===e)?.element.focus()}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}applyInteractionResult(e,t){if(!this.model)return;this.syncRadioElements();const s=this.model.state.value(),a=this.model.state.activeId(),r=e!==s,o=t!==a;if(this.value=s??"",this.syncFormAssociatedState(),!r&&!o)return;const n={value:s,activeId:a};this.dispatchInput(n),r&&this.dispatchChange(n),o&&this.focusActiveRadio()}handleRadioClick(e){if(!this.model)return;const t=this.model.state.value(),s=this.model.state.activeId();this.model.contracts.getRadioProps(e).onClick(),this.applyInteractionResult(t,s)}handleGroupKeyDown(e){if(!this.model)return;jl.has(e.key)&&e.preventDefault();const t=this.model.state.value(),s=this.model.state.activeId();this.model.contracts.getRootProps().onKeyDown(e),this.applyInteractionResult(t,s)}handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}onFormDisabledChanged(e){this.model?.actions.setDisabled(this.isEffectivelyDisabled())}onFormReset(){this.restoreValue(this.defaultValue||null)}onFormStateRestore(e){this.restoreValue(typeof e=="string"?e:null)}isFormAssociatedDisabled(){return this.isEffectivelyDisabled()}getFormAssociatedValue(){return this.model?.state.value()??null}getFormAssociatedValidity(){return this.required&&!this.model?.state.value()?{flags:{valueMissing:!0},message:"Please select an option."}:{flags:{}}}isEffectivelyDisabled(){return this.disabled||this.formDisabled}restoreValue(e){for(const t of this.radioRecords)t.element.checked=e!==null&&t.id===e;this.value=e??"",this.rebuildModelFromSlot(!1,!1),this.syncRadioElements(),this.syncFormAssociatedState()}render(){const e=this.model?.contracts.getRootProps()??{role:"radiogroup","aria-label":this.ariaLabel||void 0,"aria-labelledby":void 0,"aria-disabled":this.isEffectivelyDisabled()?"true":void 0,"aria-orientation":this.orientation};return q`
      <div
        role=${e.role}
        aria-label=${e["aria-label"]??y}
        aria-labelledby=${e["aria-labelledby"]??y}
        aria-disabled=${e["aria-disabled"]??y}
        aria-orientation=${e["aria-orientation"]}
        part="base"
        @keydown=${this.handleGroupKeyDown}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `}}class Ba extends ve{static elementName="cv-select-group";static get properties(){return{label:{type:String,reflect:!0}}}constructor(){super(),this.label=""}static styles=[Q`
      :host {
        display: grid;
        gap: var(--cv-space-1, 4px);
      }

      :host([hidden]) {
        display: none;
      }

      .label {
        padding: 0 var(--cv-space-2, 8px);
        font-size: 0.75rem;
        letter-spacing: 0.02em;
        color: var(--cv-color-text-muted, #9aa6bf);
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){const e=this.label||this.getAttribute("label")||"";return q`
      <div class="label" part="label">${e}</div>
      <slot></slot>
    `}}class ys extends ve{static elementName="cv-select-option";static get properties(){return{value:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},selected:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0}}}constructor(){super(),this.value="",this.disabled=!1,this.selected=!1,this.active=!1}static styles=[Q`
      :host {
        display: block;
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      .option {
        display: block;
        padding: var(--cv-space-2, 8px) var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        color: var(--cv-color-text, #e8ecf6);
        background: transparent;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([active]) .option {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 24%, transparent);
      }

      :host([selected]) .option {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 32%, transparent);
      }

      :host([disabled]) .option {
        opacity: 0.5;
      }

      :host(:focus-visible) .option {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<div class="option" part="base"><slot></slot></div>`}}const qi=new Set(["ArrowUp","ArrowDown","Home","End","Enter"," ","Spacebar","Escape","Tab"]);function Yl(i,e){return i.length===e.length&&i.every((t,s)=>t===e[s])}let Xl=0;class Zl extends Le{static elementName="cv-select";static get properties(){return{name:{type:String},value:{type:String,reflect:!0},selectedValues:{attribute:!1},open:{type:Boolean,reflect:!0},selectionMode:{type:String,attribute:"selection-mode",reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},closeOnSelect:{type:Boolean,attribute:"close-on-select",reflect:!0},placeholder:{type:String},disabled:{type:Boolean,reflect:!0},required:{type:Boolean,reflect:!0},clearable:{type:Boolean,reflect:!0},size:{type:String,reflect:!0}}}idBase=`cv-select-${++Xl}`;optionRecords=[];groupRecords=[];optionListeners=new WeakMap;model;defaultSelectedValues=[];didCaptureDefaultSelection=!1;constructor(){super(),this.name="",this.value="",this.selectedValues=[],this.open=!1,this.selectionMode="single",this.ariaLabel="",this.closeOnSelect=!0,this.placeholder="",this.disabled=!1,this.required=!1,this.clearable=!1,this.size="medium",this.model=Mi({options:[],idBase:this.idBase,selectionMode:this.selectionMode,closeOnSelect:this.closeOnSelect,placeholder:this.placeholder,disabled:this.isEffectivelyDisabled(),required:this.required})}static styles=[Q`
      :host {
        display: inline-block;
        inline-size: var(--cv-select-inline-size, 260px);
      }

      :host([disabled]) {
        opacity: 0.55;
        cursor: not-allowed;
        pointer-events: none;
      }

      [part='base'] {
        position: relative;
        display: grid;
        gap: var(--cv-space-1, 4px);
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--cv-space-2, 8px);
        min-block-size: var(--cv-select-min-height, 36px);
        padding: var(--cv-select-padding-block, var(--cv-space-2, 8px))
          var(--cv-select-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      :host([size='small']) {
        --cv-select-min-height: 30px;
        --cv-select-padding-inline: var(--cv-space-2, 8px);
        --cv-select-padding-block: var(--cv-space-1, 4px);
      }

      :host([size='large']) {
        --cv-select-min-height: 42px;
        --cv-select-padding-inline: var(--cv-space-4, 16px);
        --cv-select-padding-block: var(--cv-space-2, 8px);
      }

      [part='chevron'] {
        opacity: 0.72;
      }

      [part='clear-button'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        padding: 0;
        opacity: 0.55;
        font-size: 0.85em;
      }

      [part='clear-button']:hover {
        opacity: 1;
      }

      [part='listbox'] {
        position: absolute;
        inset-inline-start: 0;
        inset-block-start: calc(100% + var(--cv-space-1, 4px));
        z-index: 20;
        min-inline-size: 100%;
        max-block-size: 240px;
        overflow: auto;
        display: grid;
        gap: var(--cv-space-1, 4px);
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        box-shadow: var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24));
      }

      [part='listbox'][hidden] {
        display: none;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.rebuildModelFromSlot(!1,!1),this.syncOutsidePointerListener(),this.didCaptureDefaultSelection||(this.defaultSelectedValues=[...this.model.state.selectedIds()],this.didCaptureDefaultSelection=!0)}disconnectedCallback(){super.disconnectedCallback(),this.detachOptionListeners(),this.syncOutsidePointerListener(!0)}willUpdate(e){if(super.willUpdate(e),e.has("selectionMode")||e.has("ariaLabel")||e.has("closeOnSelect")||e.has("placeholder")){this.rebuildModelFromSlot(!0,!1),this.syncFormAssociatedState();return}if(e.has("disabled")&&this.model.actions.setDisabled(this.isEffectivelyDisabled()),e.has("required")&&this.model.actions.setRequired(this.required),e.has("value")){const t=this.value.trim(),s=this.captureState();this.selectionMode==="single"&&(t.length===0?this.model.actions.clear():this.model.actions.select(t)),this.applyInteractionResult(s)}if(e.has("selectedValues")&&this.selectionMode==="multiple"){const t=this.captureState();this.setSelectedIdsInModel(this.selectedValues),this.applyInteractionResult(t)}if(e.has("open")&&this.model.state.isOpen()!==this.open){const t=this.captureState();this.open?this.model.actions.open():this.model.actions.close(),this.applyInteractionResult(t)}(e.has("value")||e.has("selectedValues")||e.has("open")||e.has("disabled")||e.has("required")||e.has("name"))&&this.syncFormAssociatedState()}updated(e){super.updated(e),this.syncOutsidePointerListener(),!e.has("value")&&!e.has("selectedValues")&&!e.has("open")&&this.syncOptionElements()}getOptionElementsWithinGroup(e){return Array.from(e.children).filter(t=>t.tagName.toLowerCase()===ys.elementName)}ensureOptionValue(e,t){const s=e.value?.trim();if(s)return s;const a=`option-${t+1}`;return e.value=a,a}parseStructure(){const e=[],t=[];let s=0,a=0;for(const r of Array.from(this.children)){const o=r.tagName.toLowerCase();if(o===Ba.elementName){const n=r;a+=1;const l=n.id||`${this.idBase}-group-${a}`;n.id=l;const d=n.label||n.getAttribute("label")||`Group ${a}`;n.label=d;const u=[],h=this.getOptionElementsWithinGroup(n);for(const p of h){s+=1;const v=this.ensureOptionValue(p,s);u.push(v),e.push({id:v,label:p.textContent?.trim()||v,disabled:p.disabled,element:p,groupId:l})}t.push({id:l,label:d,element:n,optionIds:u});continue}if(o===ys.elementName){const n=r;s+=1;const l=this.ensureOptionValue(n,s);e.push({id:l,label:n.textContent?.trim()||l,disabled:n.disabled,element:n,groupId:null})}}return{options:e,groups:t}}resolveInitialSelectedFromOptions(e){const t=new Set(e.filter(a=>!a.disabled).map(a=>a.id));if(this.selectionMode==="single"){const a=this.value.trim();if(a&&t.has(a))return[a];const r=this.selectedValues.find(o=>t.has(o));if(r)return[r];for(const o of e)if(o.element.selected&&!o.disabled)return[o.id];return[]}const s=new Set;for(const a of this.selectedValues)t.has(a)&&s.add(a);if(s.size===0){const a=this.value.trim();a&&t.has(a)&&s.add(a)}if(s.size===0)for(const a of e)a.element.selected&&!a.disabled&&s.add(a.id);return[...s]}rebuildModelFromSlot(e,t=!0){const s=this.parseStructure(),a=e?this.captureState():{selectedIds:this.resolveInitialSelectedFromOptions(s.options),isOpen:this.open};this.detachOptionListeners(),this.optionRecords=s.options,this.groupRecords=s.groups;const r=new Set(this.optionRecords.filter(n=>!n.disabled).map(n=>n.id)),o=a.selectedIds.filter(n=>r.has(n));this.model=Mi({idBase:this.idBase,options:this.optionRecords.map(n=>({id:n.id,label:n.label,disabled:n.disabled})),selectionMode:this.selectionMode,closeOnSelect:this.closeOnSelect,placeholder:this.placeholder,ariaLabel:this.ariaLabel||void 0,initialSelectedIds:o,disabled:this.isEffectivelyDisabled(),required:this.required}),a.isOpen&&this.model.actions.open(),this.attachOptionListeners(),this.syncOptionElements(),this.syncStateFromModel(),t&&this.requestUpdate()}setSelectedIdsInModel(e){const t=new Set(this.optionRecords.filter(a=>!a.disabled).map(a=>a.id)),s=[...new Set(e)].filter(a=>t.has(a));this.model.actions.clear();for(const a of s)this.model.actions.select(a)}detachOptionListeners(){for(const e of this.optionRecords){const t=this.optionListeners.get(e.element);t&&(e.element.removeEventListener("click",t.click),e.element.removeEventListener("keydown",t.keydown),this.optionListeners.delete(e.element))}}attachOptionListeners(){for(const e of this.optionRecords){const t=a=>{a.preventDefault(),this.handleOptionClick(e.id)},s=a=>{a.stopPropagation(),this.handleListboxKeyDown(a)};e.element.addEventListener("click",t),e.element.addEventListener("keydown",s),this.optionListeners.set(e.element,{click:t,keydown:s})}}syncOptionElements(){const e=this.model.state.isOpen();for(const t of this.optionRecords){const s=this.model.contracts.getOptionProps(t.id);t.element.id=s.id,t.element.setAttribute("role",s.role),t.element.setAttribute("tabindex",s.tabindex);const a=s["aria-selected"],r=s["data-active"];t.element.setAttribute("aria-selected",a),s["aria-disabled"]?t.element.setAttribute("aria-disabled",s["aria-disabled"]):t.element.removeAttribute("aria-disabled"),t.element.setAttribute("data-active",r),t.element.active=r==="true",t.element.selected=a==="true",t.element.disabled=s["aria-disabled"]==="true",t.element.hidden=!e}for(const t of this.groupRecords)t.element.setAttribute("role","group"),t.element.setAttribute("aria-label",t.label),t.element.hidden=!e}captureState(){return{selectedIds:[...this.model.state.selectedIds()],activeId:this.model.state.activeId(),isOpen:this.model.state.isOpen()}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}focusTrigger(){this.shadowRoot?.querySelector('[part="trigger"]')?.focus()}applyInteractionResult(e){const t=this.captureState();this.syncStateFromModel();const s=!Yl(e.selectedIds,t.selectedIds),a=e.activeId!==t.activeId,r=e.isOpen!==t.isOpen;if(s||a||r){const o={value:t.selectedIds[0]??null,values:[...t.selectedIds],activeId:t.activeId,open:t.isOpen};this.dispatchInput(o),s&&this.dispatchChange(o)}e.isOpen&&!t.isOpen&&this.focusTrigger()}onFormDisabledChanged(e){this.model.actions.setDisabled(this.isEffectivelyDisabled())}onFormReset(){this.restoreSelectedIds(this.defaultSelectedValues)}onFormStateRestore(e){if(e instanceof FormData){this.restoreSelectedIds(e.getAll(this.name).filter(t=>typeof t=="string"));return}if(typeof e=="string"){this.restoreSelectedIds(this.selectionMode==="multiple"?e.split(/\s+/).filter(Boolean):[e]);return}this.restoreSelectedIds([])}isFormAssociatedDisabled(){return this.isEffectivelyDisabled()}getFormAssociatedValue(){const e=this.model.state.selectedIds();if(e.length===0)return null;if(this.selectionMode!=="multiple")return e[0]??null;if(this.name.trim().length===0)return null;const t=new FormData;for(const s of e)t.append(this.name,s);return t}getFormAssociatedValidity(){return this.required&&this.model.state.selectedIds().length===0?{flags:{valueMissing:!0},message:"Please select an option."}:{flags:{}}}isEffectivelyDisabled(){return this.disabled||this.formDisabled}syncStateFromModel(){const e=this.model.state.selectedIds();this.value=e[0]??"",this.selectedValues=[...e],this.open=this.model.state.isOpen(),this.syncOptionElements(),this.syncFormAssociatedState()}restoreSelectedIds(e){this.setSelectedIdsInModel(e),this.model.actions.close(),this.syncStateFromModel()}syncOutsidePointerListener(e=!1){!e&&this.open?document.addEventListener("pointerdown",this.handleDocumentPointerDown):document.removeEventListener("pointerdown",this.handleDocumentPointerDown)}handleDocumentPointerDown=e=>{if(!this.model.state.isOpen()||e.composedPath().includes(this))return;const s=this.captureState();this.model.actions.close(),this.applyInteractionResult(s)};handleTriggerClick(){const e=this.captureState();this.model.actions.toggle(),this.applyInteractionResult(e)}handleTriggerKeyDown(e){qi.has(e.key)&&e.preventDefault();const t=this.captureState();this.model.actions.handleTriggerKeyDown({key:e.key}),this.applyInteractionResult(t)}handleListboxKeyDown(e){if(!this.model.state.isOpen())return;qi.has(e.key)&&e.preventDefault();const t=this.captureState();this.model.actions.handleListboxKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(t)}handleOptionClick(e){const t=this.optionRecords.find(a=>a.id===e);if(!t||t.disabled)return;const s=this.captureState();this.model.actions.select(e),this.applyInteractionResult(s)}handleClearClick(e){e.stopPropagation();const t=this.captureState();this.model.actions.clear(),this.applyInteractionResult(t)}handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}getValueText(){return this.model.contracts.getValueText()||"Select..."}render(){const e=this.model.contracts.getTriggerProps(),t=this.model.contracts.getListboxProps(),s=this.value!=="",a=this.clearable&&s;return q`
      <div part="base">
        <div
          id=${e.id}
          role=${e.role}
          tabindex=${e.tabindex}
          aria-haspopup=${e["aria-haspopup"]}
          aria-expanded=${e["aria-expanded"]}
          aria-controls=${e["aria-controls"]}
          aria-activedescendant=${e["aria-activedescendant"]??y}
          aria-label=${e["aria-label"]??y}
          aria-disabled=${e["aria-disabled"]??y}
          aria-required=${e["aria-required"]??y}
          data-selected-id=${e["data-selected-id"]??y}
          data-selected-label=${e["data-selected-label"]??y}
          part="trigger"
          @click=${this.handleTriggerClick}
          @keydown=${this.handleTriggerKeyDown}
        >
          <slot name="trigger">${this.getValueText()}</slot>
          ${a?q`
                <button part="clear-button" aria-hidden="true" tabindex="-1" @click=${this.handleClearClick}>
                  ✕
                </button>
              `:y}
          <span part="chevron" aria-hidden="true">▾</span>
        </div>

        <div
          id=${t.id}
          role=${t.role}
          tabindex=${t.tabindex}
          aria-label=${t["aria-label"]??y}
          aria-multiselectable=${t["aria-multiselectable"]??y}
          aria-activedescendant=${t["aria-activedescendant"]??y}
          ?hidden=${t.hidden}
          part="listbox"
          @keydown=${this.handleListboxKeyDown}
        >
          <slot @slotchange=${this.handleSlotChange}></slot>
        </div>
      </div>
    `}}let Ql=0;const Jl=[0,.25,.5,.75,1],ec=Array.from({length:21},(i,e)=>e/20),tc=.7,sc=.3,ic=.08,ac=64;function Dt(i){return i.tagName==="CV-SIDEBAR-ITEM"}function Hi(i){return i.startsWith("#")&&i.length>1}function os(i,e,t){return Math.min(Math.max(i,e),t)}function rc(i){return typeof CSS<"u"&&typeof CSS.escape=="function"?CSS.escape(i):i.replace(/["\\#.:?[\]]/g,"\\$&")}class ld extends de{static elementName="cv-sidebar";static get properties(){return{expanded:{type:Boolean,reflect:!0},collapsed:{type:Boolean,reflect:!0},mobile:{type:Boolean,reflect:!0},overlayOpen:{type:Boolean,attribute:"overlay-open",reflect:!0},size:{type:String,reflect:!0},breakpoint:{type:String,reflect:!0},closeOnEscape:{type:Boolean,attribute:"close-on-escape",reflect:!0},closeOnOutsidePointer:{type:Boolean,attribute:"close-on-outside-pointer",reflect:!0},initialFocusId:{type:String,attribute:"initial-focus-id"},ariaLabel:{type:String,attribute:"aria-label"},scrollspy:{type:Boolean,reflect:!0},scrollspyOffsetTop:{type:Number,attribute:"scrollspy-offset-top"},scrollspyStrategy:{type:String,attribute:"scrollspy-strategy",reflect:!0},scrollspySmoothScroll:{type:Boolean,attribute:"scrollspy-smooth-scroll",reflect:!0},scrollspyRoot:{attribute:!1}}}idBase=`cv-sidebar-${++Ql}`;model;lockScrollApplied=!1;previousBodyOverflow="";lifecycleToken=0;suppressLifecycleFromUpdate=!1;mediaQuery=null;mediaQueryHandler=null;scrollspyObserver=null;scrollspyBindings=[];scrollspyActiveId=null;scrollspyRefreshToken=0;scrollspyRecomputeFrame=0;activeRevealToken=0;constructor(){super(),this.expanded=!0,this.collapsed=!1,this.mobile=!1,this.overlayOpen=!1,this.size="medium",this.breakpoint="768px",this.closeOnEscape=!0,this.closeOnOutsidePointer=!0,this.initialFocusId="",this.ariaLabel="Sidebar navigation",this.scrollspy=!1,this.scrollspyOffsetTop=0,this.scrollspyStrategy="top-anchor",this.scrollspySmoothScroll=!0,this.scrollspyRoot=null,this.model=this.createModel()}get activeId(){return this.scrollspyActiveId}static styles=[Q`
      :host {
        display: block;
        position: relative;
      }

      [part='overlay'] {
        position: fixed;
        inset: 0;
        z-index: calc(var(--cv-sidebar-z-index, 30) + 10);
        background: var(--cv-sidebar-overlay-color, color-mix(in oklab, black 56%, transparent));
      }

      [part='overlay'][hidden] {
        display: none;
      }

      [part='panel'] {
        display: grid;
        grid-template-rows: auto 1fr auto;
        position: relative;
        inline-size: var(--cv-sidebar-inline-size, 280px);
        block-size: 100%;
        background: var(--cv-sidebar-background, var(--cv-color-surface, #141923));
        border-inline-end: 1px solid var(--cv-sidebar-border-color, var(--cv-color-border, #2a3245));
        transition:
          inline-size var(--cv-sidebar-transition-duration, var(--cv-duration-normal, 200ms))
            var(--cv-sidebar-transition-easing, var(--cv-easing-standard, ease));
        overflow: hidden;
      }

      :host([collapsed]) [part='panel'] {
        inline-size: var(--cv-sidebar-rail-inline-size, 56px);
      }

      :host([size='small']) {
        --cv-sidebar-inline-size: 220px;
        --cv-sidebar-rail-inline-size: 48px;
      }

      :host([size='large']) {
        --cv-sidebar-inline-size: 340px;
        --cv-sidebar-rail-inline-size: 64px;
      }

      :host([mobile]) [part='panel'] {
        position: fixed;
        inset-block: 0;
        inset-inline-start: 0;
        z-index: calc(var(--cv-sidebar-z-index, 30) + 10);
        inline-size: var(--cv-sidebar-inline-size, 280px);
      }

      :host([mobile]:not([overlay-open])) [part='panel'] {
        display: none;
      }

      [part='header'] {
        display: flex;
        align-items: center;
        gap: var(--cv-space-2, 8px);
        padding-block: var(--cv-sidebar-padding-block, var(--cv-space-3, 12px));
        padding-inline: var(--cv-sidebar-padding-inline, var(--cv-space-3, 12px));
      }

      [part='toggle'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 28px;
        min-inline-size: 28px;
        padding: 0;
        border-radius: var(--cv-radius-sm, 6px);
        border: none;
        background: transparent;
        color: var(--cv-color-text-muted, #9aa6bf);
        cursor: pointer;
        margin-inline-start: auto;
      }

      [part='toggle']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='body'] {
        padding-block: var(--cv-sidebar-padding-block, var(--cv-space-3, 12px));
        padding-inline: var(--cv-sidebar-padding-inline, var(--cv-space-3, 12px));
        overflow: auto;
      }

      [part='footer'] {
        padding-block: var(--cv-sidebar-padding-block, var(--cv-space-3, 12px));
        padding-inline: var(--cv-sidebar-padding-inline, var(--cv-space-3, 12px));
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.setupMediaQuery(),this.syncScrollLock(),this.scheduleScrollspyRefresh()}disconnectedCallback(){super.disconnectedCallback(),this.teardownMediaQuery(),this.releaseScrollLock(),this.destroyScrollspy()}willUpdate(e){super.willUpdate(e),e.has("collapsed")&&(this.collapsed&&this.expanded?this.expanded=!1:!this.collapsed&&!this.expanded&&(this.expanded=!0)),e.has("expanded")&&(this.expanded&&this.collapsed?this.collapsed=!1:!this.expanded&&!this.collapsed&&(this.collapsed=!0));const t=e.has("closeOnEscape")||e.has("closeOnOutsidePointer")||e.has("initialFocusId")||e.has("ariaLabel");t&&(this.model=this.createModel()),(e.has("expanded")||e.has("collapsed")||t)&&(this.expanded&&!this.model.state.expanded()?this.model.actions.expand():!this.expanded&&this.model.state.expanded()&&this.model.actions.collapse()),e.has("mobile")&&this.model.state.mobile()!==this.mobile&&this.model.actions.setMobile(this.mobile),e.has("overlayOpen")&&(this.overlayOpen&&!this.model.state.overlayOpen()?this.model.actions.openOverlay():!this.overlayOpen&&this.model.state.overlayOpen()&&this.model.actions.closeOverlay()),e.has("breakpoint")&&(this.teardownMediaQuery(),this.setupMediaQuery())}updated(e){super.updated(e),this.syncScrollLock(),this.syncChildItemContext(),(e.has("collapsed")||e.has("mobile")||e.has("scrollspy")||e.has("scrollspyOffsetTop")||e.has("scrollspyStrategy")||e.has("scrollspyRoot"))&&this.scheduleScrollspyRefresh(),e.has("expanded")&&e.get("expanded")!==void 0&&(this.suppressLifecycleFromUpdate?this.suppressLifecycleFromUpdate=!1:this.mobile||this.dispatchDesktopLifecycle(this.expanded)),e.has("overlayOpen")&&e.get("overlayOpen")!==void 0&&this.dispatchOverlayLifecycle(this.overlayOpen)}createModel(){return fn({id:this.idBase,defaultExpanded:this.expanded,closeOnEscape:this.closeOnEscape,closeOnOutsidePointer:this.closeOnOutsidePointer,initialFocusId:this.initialFocusId||void 0,ariaLabel:this.ariaLabel||"Sidebar navigation"})}captureState(){return{expanded:this.model.state.expanded(),overlayOpen:this.model.state.overlayOpen()}}setupMediaQuery(){if(typeof window>"u"||!window.matchMedia)return;const e=window.matchMedia(`(max-width: ${this.breakpoint})`);this.mediaQuery=e,this.mediaQueryHandler=t=>{this.mobile=t.matches,this.model.actions.setMobile(t.matches)},e.addEventListener("change",this.mediaQueryHandler),this.mobile=e.matches,this.model.actions.setMobile(e.matches)}teardownMediaQuery(){this.mediaQuery&&this.mediaQueryHandler&&this.mediaQuery.removeEventListener("change",this.mediaQueryHandler),this.mediaQuery=null,this.mediaQueryHandler=null}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}dispatchLifecycleEvent(e){this.dispatchEvent(new CustomEvent(e,{bubbles:!0,composed:!0}))}dispatchDesktopLifecycle(e){const t=++this.lifecycleToken;this.dispatchLifecycleEvent(e?"cv-expand":"cv-collapse"),this.updateComplete.then(()=>{this.lifecycleToken===t&&this.dispatchLifecycleEvent(e?"cv-after-expand":"cv-after-collapse")})}dispatchOverlayLifecycle(e){const t=++this.lifecycleToken;this.dispatchLifecycleEvent(e?"cv-overlay-open":"cv-overlay-close"),this.updateComplete.then(()=>{this.lifecycleToken===t&&this.dispatchLifecycleEvent(e?"cv-after-overlay-open":"cv-after-overlay-close")})}dispatchScrollspyChange(e){this.dispatchEvent(new CustomEvent("cv-scrollspy-change",{detail:{activeId:e},bubbles:!0,composed:!0}))}applyInteractionResult(e){const t=this.model.state.expanded(),s=this.model.state.overlayOpen();if(!this.mobile&&e.expanded!==t){this.suppressLifecycleFromUpdate=!0,this.expanded=t,this.collapsed=!t,this.dispatchDesktopLifecycle(t);const a={expanded:t};this.dispatchInput(a),this.dispatchChange(a)}if(this.mobile&&e.overlayOpen!==s){this.overlayOpen=s;const a={overlayOpen:s};this.dispatchInput(a),this.dispatchChange(a)}}syncScrollLock(){const e=this.model.state.shouldLockScroll();e&&!this.lockScrollApplied?(this.previousBodyOverflow=document.body.style.overflow,document.body.style.overflow="hidden",this.lockScrollApplied=!0):!e&&this.lockScrollApplied&&this.releaseScrollLock()}releaseScrollLock(){this.lockScrollApplied&&(document.body.style.overflow=this.previousBodyOverflow,this.lockScrollApplied=!1)}getDefaultSlot(){return this.shadowRoot?.querySelector("slot:not([name])")??null}getAssignedElements(){return this.getDefaultSlot()?.assignedElements({flatten:!0})??[]}getSidebarItems(){return this.getAssignedElements().filter(Dt)}syncChildItemContext(){for(const e of this.getSidebarItems())e.toggleAttribute("data-sidebar-collapsed",this.collapsed),e.toggleAttribute("data-sidebar-mobile",this.mobile)}handleDefaultSlotChange(){this.syncChildItemContext(),this.scheduleScrollspyRefresh()}handleToggleClick(){const e=this.captureState();this.model.actions.toggle(),this.applyInteractionResult(e)}handleOverlayPointerDown(e){if(e.target!==e.currentTarget)return;const t=this.captureState();this.model.actions.handleOutsidePointer(),this.applyInteractionResult(t)}handlePanelKeyDown(e){e.key==="Escape"&&e.preventDefault();const t=this.captureState();this.model.actions.handleKeyDown({key:e.key}),this.applyInteractionResult(t)}handleBodyClick(e){if(!this.scrollspy||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const t=this.resolveBindingFromEvent(e);if(!t||Dt(t.source)&&t.source.disabled)return;const s=this.resolveScrollspyStrategy();e.preventDefault(),s==="top-anchor"&&this.updateActiveId(t.id),this.scrollBindingTarget(t,s)}resolveBindingFromEvent(e){const t=e.composedPath();for(const s of this.scrollspyBindings)if(t.includes(s.source))return s;return null}scheduleScrollspyRefresh(){const e=++this.scrollspyRefreshToken;queueMicrotask(()=>{e!==this.scrollspyRefreshToken||!this.isConnected||this.refreshScrollspy()})}refreshScrollspy(){if(this.destroyScrollspy(),this.syncChildItemContext(),!this.scrollspy){this.updateActiveId(null);return}if(this.scrollspyBindings=this.collectScrollspyBindings(),this.syncScrollspyActiveState(),!this.scrollspyBindings.length){this.updateActiveId(null);return}if(typeof IntersectionObserver>"u"){this.updateActiveId(this.computeActiveId());return}this.scrollspyObserver=new IntersectionObserver(this.handleScrollspyIntersection.bind(this),this.getScrollspyObserverOptions());for(const e of this.scrollspyBindings)this.scrollspyObserver.observe(e.target);this.scheduleScrollspyRecompute()}destroyScrollspy(){this.cancelScrollspyRecompute(),this.scrollspyObserver?.disconnect(),this.scrollspyObserver=null,this.scrollspyBindings=[]}collectScrollspyBindings(){const e=[];for(const t of this.getAssignedElements()){const s=this.getHashHref(t);if(!s)continue;const a=s.slice(1),r=this.resolveScrollspyTarget(a);r&&e.push({href:s,id:a,source:t,target:r})}return e}getHashHref(e){if(Dt(e))return Hi(e.href)?e.href:null;if(e instanceof HTMLAnchorElement){const t=e.getAttribute("href")??"";return Hi(t)?t:null}return null}resolveScrollspyTarget(e){if(!e)return null;const s=this.resolveScrollspyContainer().querySelector(`#${rc(e)}`);return s instanceof HTMLElement?s:null}resolveScrollspyContainer(){if(this.scrollspyRoot)return this.scrollspyRoot;const e=this.getRootNode();return e instanceof ShadowRoot||e instanceof Document?e:this.ownerDocument}handleScrollspyIntersection(){this.scheduleScrollspyRecompute()}computeActiveId(){return this.resolveScrollspyStrategy()==="viewport-dominant"?this.computeViewportDominantActiveId():this.computeTopAnchorActiveId()}computeTopAnchorActiveId(){if(!this.scrollspyBindings.length)return null;const e=Math.max(0,this.scrollspyOffsetTop),t=typeof window>"u"?0:window.innerHeight;let s=null,a=null,r=null;for(const o of this.scrollspyBindings){const n=o.target.getBoundingClientRect();if(!(n.height>0||n.width>0))continue;const d=n.top<t&&n.bottom>e,u=n.top<=e,h=Math.abs(n.top-e);d&&(!s||h<s.distance||h===s.distance&&u&&!s.crossedAnchor)&&(s={id:o.id,distance:h,crossedAnchor:u}),u&&(!a||n.top>a.top)&&(a={id:o.id,top:n.top}),!u&&(!r||n.top<r.top)&&(r={id:o.id,top:n.top})}return s?.id??a?.id??r?.id??null}computeViewportDominantActiveId(){if(!this.scrollspyBindings.length||typeof window>"u")return null;const e=Math.max(0,this.scrollspyOffsetTop),t=window.innerHeight,s=Math.max(1,t-e),a=e+s/2;let r=null,o=null;for(const n of this.scrollspyBindings){const l=n.target.getBoundingClientRect();if(!(l.height>0||l.width>0))continue;const u=Math.max(l.top,e),h=Math.min(l.bottom,t),p=os(h-u,0,s);if(p<=0)continue;const v=p/Math.max(1,Math.min(l.height,s)),g=l.top+l.height/2,f=os(1-Math.abs(g-a)/Math.max(1,s/2),0,1),x=v*tc+f*sc;(!r||x>r.score)&&(r={id:n.id,score:x,visiblePx:p}),n.id===this.scrollspyActiveId&&(o={score:x,visiblePx:p})}return r?r.id===this.scrollspyActiveId||!o||o.visiblePx<ac||r.score>=o.score+ic?r.id:this.scrollspyActiveId:null}getScrollspyObserverOptions(){return this.resolveScrollspyStrategy()==="viewport-dominant"?{rootMargin:"0px",threshold:ec}:{rootMargin:`-${Math.max(0,this.scrollspyOffsetTop)}px 0px -60% 0px`,threshold:Jl}}resolveScrollspyStrategy(){return this.scrollspyStrategy==="viewport-dominant"?"viewport-dominant":"top-anchor"}scrollBindingTarget(e,t){const s=this.scrollspySmoothScroll?"smooth":"auto";if(t!=="viewport-dominant"||typeof window>"u"){e.target.scrollIntoView({behavior:s,block:"start"});return}const a=Math.max(0,this.scrollspyOffsetTop),r=window.innerHeight,o=Math.max(1,r-a),n=a+o/2,l=window.scrollY||window.pageYOffset||0,d=e.target.getBoundingClientRect(),u=l+d.top+d.height/2,h=document.scrollingElement??document.documentElement,p=Math.max(0,h.scrollHeight-window.innerHeight),v=os(u-n,0,p);window.scrollTo({top:v,behavior:s})}scheduleScrollspyRecompute(){this.scrollspyRecomputeFrame||(this.scrollspyRecomputeFrame=requestAnimationFrame(()=>{this.scrollspyRecomputeFrame=0,!(!this.isConnected||!this.scrollspy)&&this.updateActiveId(this.computeActiveId())}))}cancelScrollspyRecompute(){this.scrollspyRecomputeFrame&&(cancelAnimationFrame(this.scrollspyRecomputeFrame),this.scrollspyRecomputeFrame=0)}updateActiveId(e){if(this.scrollspyActiveId===e){this.syncScrollspyActiveState(),this.revealActiveBinding();return}this.scrollspyActiveId=e,this.syncScrollspyActiveState(),this.revealActiveBinding(),this.dispatchScrollspyChange(e)}syncScrollspyActiveState(){for(const e of this.scrollspyBindings){const t=e.id===this.scrollspyActiveId;Dt(e.source)?e.source.active=t:(e.source.toggleAttribute("data-active",t),t?(e.source.ariaCurrent="location",e.source.setAttribute("aria-current","location")):(e.source.ariaCurrent="",e.source.removeAttribute("aria-current")))}}revealActiveBinding(){const e=this.scrollspyBindings.find(r=>r.id===this.scrollspyActiveId);if(!e)return;const t=e.source,s=this.shadowRoot?.querySelector('[part="body"]');if(!s)return;const a=++this.activeRevealToken;requestAnimationFrame(()=>{if(a!==this.activeRevealToken)return;const r=t.getBoundingClientRect(),o=s.getBoundingClientRect(),n=12;if(r.top<o.top+n){s.scrollTop-=o.top+n-r.top;return}r.bottom>o.bottom-n&&(s.scrollTop+=r.bottom-(o.bottom-n))})}render(){const e=this.model.contracts.getSidebarProps(),t=this.model.contracts.getToggleProps(),s=this.model.contracts.getOverlayProps();return q`
      <div
        id=${s.id}
        ?hidden=${s.hidden}
        data-open=${s["data-open"]}
        part="overlay"
        @mousedown=${this.handleOverlayPointerDown}
      ></div>

      <aside
        id=${e.id}
        role=${e.role}
        aria-label=${e["aria-label"]}
        aria-modal=${e["aria-modal"]??y}
        ?data-collapsed=${e["data-collapsed"]==="true"}
        ?data-mobile=${e["data-mobile"]==="true"}
        part="panel"
        @keydown=${this.handlePanelKeyDown}
      >
        <header part="header">
          <slot name="header"></slot>
          <button
            id=${t.id}
            role=${t.role}
            tabindex=${t.tabindex}
            aria-expanded=${t["aria-expanded"]}
            aria-controls=${t["aria-controls"]}
            aria-label=${t["aria-label"]}
            type="button"
            part="toggle"
            @click=${this.handleToggleClick}
          >
            <slot name="toggle">&#9776;</slot>
          </button>
        </header>

        <nav part="body" @click=${this.handleBodyClick}>
          <slot @slotchange=${this.handleDefaultSlotChange}></slot>
        </nav>

        <footer part="footer">
          <slot name="footer"></slot>
        </footer>
      </aside>
    `}}class cd extends ve{static elementName="cv-sidebar-item";static get properties(){return{href:{type:String,reflect:!0},active:{type:Boolean,reflect:!0},disabled:{type:Boolean,reflect:!0}}}constructor(){super(),this.href="",this.active=!1,this.disabled=!1}static styles=[Q`
      :host {
        display: block;
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      [part='base'] {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--cv-sidebar-item-gap, var(--cv-space-2, 8px));
        min-block-size: var(--cv-sidebar-item-min-block-size, 32px);
        padding-block: var(--cv-sidebar-item-padding-block, var(--cv-space-2, 8px));
        padding-inline: var(--cv-sidebar-item-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-sidebar-item-border-radius, var(--cv-radius-sm, 6px));
        border-inline-start: var(--cv-sidebar-item-indicator-width, 2px) solid transparent;
        background: var(--cv-sidebar-item-background, transparent);
        color: var(--cv-sidebar-item-color, var(--cv-color-text-muted, #9aa6bf));
        font-family: var(--cv-sidebar-item-font-family, inherit);
        font-size: var(--cv-sidebar-item-font-size, inherit);
        font-weight: var(--cv-sidebar-item-font-weight, inherit);
        letter-spacing: var(--cv-sidebar-item-letter-spacing, normal);
        text-decoration: none;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
        overflow: hidden;
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-sidebar-item-outline-color, var(--cv-color-primary, #65d7ff));
        outline-offset: 1px;
      }

      :host(:hover) [part='base'] {
        background: var(
          --cv-sidebar-item-background-hover,
          color-mix(in oklab, var(--cv-color-surface, #141923) 82%, white 18%)
        );
        color: var(--cv-sidebar-item-color-hover, var(--cv-color-text, #e8ecf6));
      }

      :host([active]) [part='base'] {
        background: var(--cv-sidebar-item-background-active, transparent);
        color: var(--cv-sidebar-item-color-active, var(--cv-color-primary, #65d7ff));
        border-inline-start-color: var(
          --cv-sidebar-item-indicator-color,
          var(--cv-color-primary, #65d7ff)
        );
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
        cursor: not-allowed;
      }

      [part='prefix'],
      [part='suffix'] {
        position: relative;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      [part='label'] {
        position: relative;
        z-index: 1;
        flex: 1;
        min-inline-size: 0;
      }

      :host([data-sidebar-collapsed]:not([data-sidebar-mobile])) [part='base'] {
        justify-content: center;
        padding-inline: var(--cv-sidebar-item-collapsed-padding-inline, var(--cv-space-2, 8px));
      }

      :host([data-sidebar-collapsed]:not([data-sidebar-mobile])) [part='label'] {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        margin: -1px;
        padding: 0;
        border: 0;
        clip: rect(0 0 0 0);
        overflow: hidden;
        white-space: nowrap;
      }

      :host([data-sidebar-collapsed]:not([data-sidebar-mobile])) [part='suffix'] {
        display: none;
      }

    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}handleClick(e){this.disabled&&(e.preventDefault(),e.stopPropagation())}render(){return q`
      <a
        part="base"
        href=${!this.disabled&&this.href?this.href:y}
        aria-current=${this.active?"location":y}
        aria-disabled=${this.disabled?"true":y}
        tabindex=${this.disabled?"-1":y}
        @click=${this.handleClick}
      >
        <span part="prefix"><slot name="prefix"></slot></span>
        <span part="label"><slot></slot></span>
        <span part="suffix"><slot name="suffix"></slot></span>
      </a>
    `}}const oc=new Set(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","PageUp","PageDown","Home","End"]);let nc=0;class lc extends de{static elementName="cv-slider";static get properties(){return{value:{type:Number,reflect:!0},min:{type:Number,reflect:!0},max:{type:Number,reflect:!0},step:{type:Number,reflect:!0},largeStep:{type:Number,attribute:"large-step",reflect:!0},orientation:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},ariaLabelledBy:{type:String,attribute:"aria-labelledby"},ariaDescribedBy:{type:String,attribute:"aria-describedby"}}}idBase=`cv-slider-${++nc}`;model;dragging=!1;dragValueChanged=!1;constructor(){super(),this.value=0,this.min=0,this.max=100,this.step=1,this.largeStep=10,this.orientation="horizontal",this.disabled=!1,this.ariaLabel="",this.ariaLabelledBy="",this.ariaDescribedBy="",this.model=this.createModel()}static styles=[Q`
      :host {
        display: inline-block;
        inline-size: 240px;
        min-block-size: 24px;
      }

      [part='base'] {
        position: relative;
        display: grid;
        place-items: center;
        inline-size: 100%;
        block-size: 24px;
        --cv-slider-percentage: 0%;
      }

      [part='track'] {
        position: relative;
        inline-size: 100%;
        block-size: 6px;
        border-radius: 999px;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      [part='range'] {
        position: absolute;
        inset-block: 0;
        inset-inline-start: 0;
        inline-size: var(--cv-slider-percentage);
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--cv-color-primary, #65d7ff) 0%,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 70%, white) 100%
        );
      }

      [part='thumb'] {
        position: absolute;
        inset-inline-start: var(--cv-slider-percentage);
        inset-block-start: 50%;
        inline-size: 16px;
        block-size: 16px;
        border-radius: 50%;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        transform: translate(-50%, -50%);
        cursor: grab;
      }

      [part='thumb']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      [part='thumb']:active {
        cursor: grabbing;
      }

      :host([orientation='vertical']) {
        inline-size: 24px;
        block-size: 180px;
      }

      :host([orientation='vertical']) [part='base'] {
        inline-size: 24px;
        block-size: 100%;
      }

      :host([orientation='vertical']) [part='track'] {
        inline-size: 6px;
        block-size: 100%;
      }

      :host([orientation='vertical']) [part='range'] {
        inline-size: 100%;
        block-size: var(--cv-slider-percentage);
        inset-inline-start: 0;
        inset-block-end: 0;
        inset-block-start: auto;
        background: linear-gradient(
          180deg,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 70%, white) 0%,
          var(--cv-color-primary, #65d7ff) 100%
        );
      }

      :host([orientation='vertical']) [part='thumb'] {
        inset-inline-start: 50%;
        inset-block-start: auto;
        inset-block-end: var(--cv-slider-percentage);
        transform: translate(-50%, 50%);
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
      }

      :host([disabled]) [part='thumb'] {
        cursor: not-allowed;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}disconnectedCallback(){super.disconnectedCallback(),this.cleanupDragListeners()}willUpdate(e){if(super.willUpdate(e),e.has("min")||e.has("max")||e.has("step")||e.has("largeStep")||e.has("orientation")||e.has("ariaLabel")||e.has("ariaLabelledBy")||e.has("ariaDescribedBy")){this.model=this.createModel();return}e.has("disabled")&&this.model.actions.setDisabled(this.disabled),e.has("value")&&this.model.state.value()!==this.value&&this.model.actions.setValue(this.value)}createModel(){return Io({idBase:this.idBase,value:this.value,min:this.min,max:this.max,step:this.step,largeStep:this.largeStep,orientation:this.orientation,isDisabled:this.disabled,ariaLabel:this.ariaLabel||void 0,ariaLabelledBy:this.ariaLabelledBy||void 0,ariaDescribedBy:this.ariaDescribedBy||void 0})}getEventDetail(){return{value:this.model.state.value(),percentage:this.model.state.percentage()}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}syncFromModelAndEmit(e,t){const s=this.model.state.value();if(this.value=s,e===s)return!1;const a=this.getEventDetail();return this.dispatchInput(a),t&&this.dispatchChange(a),!0}updateValueFromPointer(e,t){const s=this.shadowRoot?.querySelector('[part="track"]');if(!s)return!1;const a=s.getBoundingClientRect();if(a.width<=0||a.height<=0)return!1;const r=this.orientation==="vertical"?(a.bottom-t)/a.height:(e-a.left)/a.width,o=Math.max(0,Math.min(1,r)),n=this.model.state.min(),l=this.model.state.max(),d=n+o*(l-n),u=this.model.state.value();return this.model.actions.setValue(d),this.syncFromModelAndEmit(u,!1)}handleThumbKeyDown(e){oc.has(e.key)&&e.preventDefault();const t=this.model.state.value();this.model.contracts.getThumbProps().onKeyDown(e),this.syncFromModelAndEmit(t,!0)}handleTrackMouseDown(e){this.disabled||e.button!==0||(e.preventDefault(),this.shadowRoot?.querySelector('[part="thumb"]')?.focus(),this.dragging=!0,this.dragValueChanged=this.updateValueFromPointer(e.clientX,e.clientY),document.addEventListener("mousemove",this.handleDocumentMouseMove),document.addEventListener("mouseup",this.handleDocumentMouseUp))}handleDocumentMouseMove=e=>{if(!this.dragging)return;const t=this.updateValueFromPointer(e.clientX,e.clientY);this.dragValueChanged=this.dragValueChanged||t};handleDocumentMouseUp=e=>{if(!this.dragging)return;const t=this.updateValueFromPointer(e.clientX,e.clientY);this.dragValueChanged=this.dragValueChanged||t,this.dragValueChanged&&this.dispatchChange(this.getEventDetail()),this.dragging=!1,this.dragValueChanged=!1,this.cleanupDragListeners()};cleanupDragListeners(){document.removeEventListener("mousemove",this.handleDocumentMouseMove),document.removeEventListener("mouseup",this.handleDocumentMouseUp)}render(){const e=this.model.contracts.getRootProps(),t=this.model.contracts.getTrackProps(),s=this.model.contracts.getThumbProps(),a=Math.max(0,Math.min(100,this.model.state.percentage()));return q`
      <div
        id=${e.id}
        data-orientation=${e["data-orientation"]}
        aria-disabled=${e["aria-disabled"]??y}
        style=${`--cv-slider-percentage:${a}%;`}
        part="base"
      >
        <div
          id=${t.id}
          data-orientation=${t["data-orientation"]}
          part="track"
          @mousedown=${this.handleTrackMouseDown}
        >
          <div part="range"></div>
          <div
            id=${s.id}
            role=${s.role}
            tabindex=${s.tabindex}
            aria-valuenow=${s["aria-valuenow"]}
            aria-valuemin=${s["aria-valuemin"]}
            aria-valuemax=${s["aria-valuemax"]}
            aria-valuetext=${s["aria-valuetext"]??y}
            aria-orientation=${s["aria-orientation"]}
            aria-disabled=${s["aria-disabled"]??y}
            aria-label=${s["aria-label"]??y}
            aria-labelledby=${s["aria-labelledby"]??y}
            aria-describedby=${s["aria-describedby"]??y}
            part="thumb"
            @keydown=${this.handleThumbKeyDown}
          ></div>
        </div>
      </div>
    `}}const cc=new Set(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","PageUp","PageDown","Home","End"]),ns=(i,e)=>i.length===e.length&&i.every((t,s)=>t===e[s]);let dc=0;class uc extends de{static elementName="cv-slider-multi-thumb";static get properties(){return{values:{attribute:!1},min:{type:Number,reflect:!0},max:{type:Number,reflect:!0},step:{type:Number,reflect:!0},largeStep:{type:Number,attribute:"large-step",reflect:!0},orientation:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0}}}idBase=`cv-slider-multi-thumb-${++dc}`;model;draggingThumbIndex=null;dragValueChanged=!1;constructor(){super(),this.values=[25,75],this.min=0,this.max=100,this.step=1,this.largeStep=10,this.orientation="horizontal",this.disabled=!1,this.model=this.createModel()}static styles=[Q`
      :host {
        display: inline-block;
        inline-size: 240px;
        min-block-size: 24px;
      }

      [part='base'] {
        position: relative;
        display: grid;
        place-items: center;
        inline-size: 100%;
        block-size: 24px;
        --cv-range-start: 0%;
        --cv-range-size: 0%;
      }

      [part='track'] {
        position: relative;
        inline-size: 100%;
        block-size: 6px;
        border-radius: 999px;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      [part='range'] {
        position: absolute;
        inset-block: 0;
        inset-inline-start: var(--cv-range-start);
        inline-size: var(--cv-range-size);
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--cv-color-primary, #65d7ff) 0%,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 70%, white) 100%
        );
      }

      [part='thumb'] {
        position: absolute;
        inset-inline-start: var(--cv-thumb-percentage);
        inset-block-start: 50%;
        inline-size: 16px;
        block-size: 16px;
        border-radius: 50%;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        transform: translate(-50%, -50%);
        cursor: grab;
      }

      [part='thumb'][data-active='true'] {
        border-color: var(--cv-color-primary, #65d7ff);
      }

      [part='thumb']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      [part='thumb']:active {
        cursor: grabbing;
      }

      :host([orientation='vertical']) {
        inline-size: 24px;
        block-size: 180px;
      }

      :host([orientation='vertical']) [part='base'] {
        inline-size: 24px;
        block-size: 100%;
      }

      :host([orientation='vertical']) [part='track'] {
        inline-size: 6px;
        block-size: 100%;
      }

      :host([orientation='vertical']) [part='range'] {
        inline-size: 100%;
        block-size: var(--cv-range-size);
        inset-inline-start: 0;
        inset-block-end: var(--cv-range-start);
        inset-block-start: auto;
        background: linear-gradient(
          180deg,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 70%, white) 0%,
          var(--cv-color-primary, #65d7ff) 100%
        );
      }

      :host([orientation='vertical']) [part='thumb'] {
        inset-inline-start: 50%;
        inset-block-start: auto;
        inset-block-end: var(--cv-thumb-percentage);
        transform: translate(-50%, 50%);
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
      }

      :host([disabled]) [part='thumb'] {
        cursor: not-allowed;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}disconnectedCallback(){super.disconnectedCallback(),this.cleanupDragListeners()}willUpdate(e){if(super.willUpdate(e),e.has("min")||e.has("max")||e.has("step")||e.has("largeStep")||e.has("orientation")||e.has("values")&&!ns(this.values,this.model.state.values())){this.model=this.createModel(),this.syncValuesFromModel();return}e.has("disabled")&&this.model.actions.setDisabled(this.disabled)}createModel(){return Mo({idBase:this.idBase,values:this.values,min:this.min,max:this.max,step:this.step,largeStep:this.largeStep,orientation:this.orientation,isDisabled:this.disabled,getThumbAriaLabel:e=>`Thumb ${e+1}`,formatValueText:e=>String(e)})}getEventDetail(){return{values:[...this.model.state.values()],activeThumbIndex:this.model.state.activeThumbIndex()}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}syncValuesFromModel(){const e=[...this.model.state.values()];ns(this.values,e)||(this.values=e)}syncFromModelAndEmit(e,t){const s=[...this.model.state.values()];if(this.syncValuesFromModel(),ns(e,s))return!1;const a=this.getEventDetail();return this.dispatchInput(a),t&&this.dispatchChange(a),!0}pointerValueFromPosition(e,t){const s=this.shadowRoot?.querySelector('[part="track"]');if(!s)return null;const a=s.getBoundingClientRect();if(a.width<=0||a.height<=0)return null;const r=this.orientation==="vertical"?(a.bottom-t)/a.height:(e-a.left)/a.width,o=Math.max(0,Math.min(1,r)),n=this.model.state.min(),l=this.model.state.max();return n+o*(l-n)}pickNearestThumbIndex(e){const t=this.model.state.values();if(t.length===0)return null;let s=0,a=Number.POSITIVE_INFINITY;for(const[r,o]of t.entries()){const n=Math.abs(o-e);n<a&&(a=n,s=r)}return s}updateValueFromPointer(e,t,s){const a=this.pointerValueFromPosition(t,s);if(a==null)return!1;const r=[...this.model.state.values()];return this.model.actions.setValue(e,a),this.syncFromModelAndEmit(r,!1)}focusThumb(e){this.shadowRoot?.querySelector(`[part="thumb"][data-index="${e}"]`)?.focus()}handleTrackMouseDown(e){if(this.disabled||e.button!==0)return;const t=this.pointerValueFromPosition(e.clientX,e.clientY);if(t==null)return;const s=this.pickNearestThumbIndex(t);s!=null&&(e.preventDefault(),this.model.actions.setActiveThumb(s),this.draggingThumbIndex=s,this.dragValueChanged=this.updateValueFromPointer(s,e.clientX,e.clientY),this.focusThumb(s),document.addEventListener("mousemove",this.handleDocumentMouseMove),document.addEventListener("mouseup",this.handleDocumentMouseUp))}handleDocumentMouseMove=e=>{if(this.draggingThumbIndex==null)return;const t=this.updateValueFromPointer(this.draggingThumbIndex,e.clientX,e.clientY);this.dragValueChanged=this.dragValueChanged||t};handleDocumentMouseUp=e=>{if(this.draggingThumbIndex==null)return;const t=this.updateValueFromPointer(this.draggingThumbIndex,e.clientX,e.clientY);this.dragValueChanged=this.dragValueChanged||t,this.dragValueChanged&&this.dispatchChange(this.getEventDetail()),this.draggingThumbIndex=null,this.dragValueChanged=!1,this.cleanupDragListeners()};cleanupDragListeners(){document.removeEventListener("mousemove",this.handleDocumentMouseMove),document.removeEventListener("mouseup",this.handleDocumentMouseUp)}handleThumbFocus=e=>{this.model.actions.setActiveThumb(e),this.requestUpdate()};handleThumbKeyDown=(e,t)=>{cc.has(t.key)&&t.preventDefault();const s=[...this.model.state.values()];this.model.contracts.getThumbProps(e).onKeyDown(t),this.syncFromModelAndEmit(s,!0)};render(){const e=this.model.contracts.getRootProps(),t=this.model.contracts.getTrackProps(),s=this.model.state.values(),a=this.model.state.min(),r=this.model.state.max(),o=Math.max(r-a,1),n=s.map(h=>Math.max(0,Math.min(100,(h-a)/o*100))),l=n.length===0?0:Math.min(...n),d=n.length===0?0:Math.max(...n),u=Math.max(0,d-l);return q`
      <div
        id=${e.id}
        data-orientation=${e["data-orientation"]}
        aria-disabled=${e["aria-disabled"]??y}
        style=${`--cv-range-start:${l}%;--cv-range-size:${u}%;`}
        part="base"
      >
        <div id=${t.id} data-orientation=${t["data-orientation"]} part="track" @mousedown=${this.handleTrackMouseDown}>
          <div part="range"></div>
        </div>
        ${s.map((h,p)=>{const v=this.model.contracts.getThumbProps(p);return q`
            <button
              id=${v.id}
              type="button"
              role=${v.role}
              tabindex=${v.tabindex}
              aria-valuenow=${v["aria-valuenow"]}
              aria-valuemin=${v["aria-valuemin"]}
              aria-valuemax=${v["aria-valuemax"]}
              aria-valuetext=${v["aria-valuetext"]??y}
              aria-orientation=${v["aria-orientation"]}
              aria-disabled=${v["aria-disabled"]??y}
              aria-label=${v["aria-label"]??y}
              data-active=${v["data-active"]}
              data-index=${String(p)}
              style=${`--cv-thumb-percentage:${n[p]??0}%;`}
              part="thumb"
              @focus=${()=>this.handleThumbFocus(p)}
              @keydown=${g=>this.handleThumbKeyDown(p,g)}
            ></button>
          `})}
      </div>
    `}}const hc=new Set(["ArrowUp","ArrowDown","PageUp","PageDown","Home","End"]),ls=1e-9;let pc=0;class mc extends Le{static elementName="cv-spinbutton";static get properties(){return{name:{type:String,reflect:!0},value:{type:Number,reflect:!0},min:{type:Number,reflect:!0},max:{type:Number,reflect:!0},step:{type:Number,reflect:!0},largeStep:{type:Number,attribute:"large-step",reflect:!0},disabled:{type:Boolean,reflect:!0},readOnly:{type:Boolean,attribute:"read-only",reflect:!0},required:{type:Boolean,reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},ariaLabelledBy:{type:String,attribute:"aria-labelledby"},ariaDescribedBy:{type:String,attribute:"aria-describedby"}}}idBase=`cv-spinbutton-${++pc}`;model;customValidityMessage="";draftValue=null;initialValueSnapshot=0;hasInitialValueSnapshot=!1;constructor(){super(),this.name="",this.value=0,this.min=null,this.max=null,this.step=1,this.largeStep=10,this.disabled=!1,this.readOnly=!1,this.required=!1,this.ariaLabel="",this.ariaLabelledBy="",this.ariaDescribedBy="",this.model=this.createModel()}static styles=[Q`
      :host {
        display: inline-block;
      }

      [part='base'] {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: var(--cv-space-1, 4px);
        align-items: center;
        min-inline-size: 130px;
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='input'] {
        inline-size: 100%;
        min-inline-size: 0;
        border: 0;
        outline: none;
        background: transparent;
        color: inherit;
        font: inherit;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
        padding: 0;
      }

      [part='input']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='actions'] {
        display: grid;
        grid-template-rows: 1fr 1fr;
        gap: 1px;
      }

      [part='increment'],
      [part='decrement'] {
        min-inline-size: 26px;
        min-block-size: 16px;
        border-radius: 4px;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
        padding: 0;
        line-height: 1;
      }

      :host([disabled]) [part='base'],
      :host([read-only]) [part='base'] {
        opacity: 0.6;
      }

      :host([disabled]) [part='increment'],
      :host([disabled]) [part='decrement'],
      :host([read-only]) [part='increment'],
      :host([read-only]) [part='decrement'] {
        cursor: not-allowed;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.hasInitialValueSnapshot||(this.initialValueSnapshot=this.value,this.hasInitialValueSnapshot=!0)}willUpdate(e){if(super.willUpdate(e),e.has("min")||e.has("max")||e.has("step")||e.has("largeStep")||e.has("ariaLabel")||e.has("ariaLabelledBy")||e.has("ariaDescribedBy")){this.model=this.createModel(),this.draftValue=null,this.syncValueFromModel();return}if(e.has("disabled")&&this.model.actions.setDisabled(this.isEffectivelyDisabled()),e.has("readOnly")&&this.model.actions.setReadOnly(this.readOnly),e.has("value")&&this.model.state.value()!==this.value){const t=this.model.state.value();this.model.actions.setValue(this.value),this.syncFromModelAndMaybeEmit(t,!1)}}updated(e){super.updated(e),(e.has("value")||e.has("disabled")||e.has("readOnly")||e.has("required")||e.has("name")||e.has("min")||e.has("max")||e.has("step")||e.has("largeStep"))&&this.syncFormAssociatedState()}onFormDisabledChanged(e){this.model.actions.setDisabled(this.isEffectivelyDisabled())}onFormReset(){this.customValidityMessage="",this.draftValue=null,this.setValue(this.initialValueSnapshot)}onFormStateRestore(e){if(typeof e!="string")return;const t=Number(e);Number.isFinite(t)&&this.setValue(t)}get type(){return"cv-spinbutton"}setCustomValidity(e){this.customValidityMessage=e,this.syncFormAssociatedState()}stepUp(e=1){this.applyProgrammaticMutation(()=>{for(let t=0;t<this.normalizeTimes(e);t++)this.model.actions.increment()})}stepDown(e=1){this.applyProgrammaticMutation(()=>{for(let t=0;t<this.normalizeTimes(e);t++)this.model.actions.decrement()})}pageUp(e=1){this.applyProgrammaticMutation(()=>{for(let t=0;t<this.normalizeTimes(e);t++)this.model.actions.incrementLarge()})}pageDown(e=1){this.applyProgrammaticMutation(()=>{for(let t=0;t<this.normalizeTimes(e);t++)this.model.actions.decrementLarge()})}setValue(e){this.applyProgrammaticMutation(()=>{this.model.actions.setValue(e)})}getValue(){return this.model.state.value()}setRange(e,t){this.min=e,this.max=t}focus(e){if(this.inputElement){this.inputElement.focus(e);return}super.focus(e)}select(){this.inputElement?.select()}get inputElement(){return this.shadowRoot?.querySelector('[part="input"]')}isEffectivelyDisabled(){return this.disabled||this.formDisabled}isFormAssociatedDisabled(){return this.isEffectivelyDisabled()}getFormAssociatedValue(){return String(this.model.state.value())}getFormAssociatedValidity(){const e=this.getValidityState();return this.hasValidityErrors(e.flags)?{flags:e.flags,message:e.message,anchor:this.inputElement??void 0}:{flags:{}}}toFiniteOrUndefined(e){return typeof e=="number"&&Number.isFinite(e)?e:void 0}createModel(){return Ea({idBase:this.idBase,value:this.value,min:this.toFiniteOrUndefined(this.min),max:this.toFiniteOrUndefined(this.max),step:this.step,largeStep:this.largeStep,isDisabled:this.isEffectivelyDisabled(),isReadOnly:this.readOnly,ariaLabel:this.ariaLabel||void 0,ariaLabelledBy:this.ariaLabelledBy||void 0,ariaDescribedBy:this.ariaDescribedBy||void 0})}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}syncValueFromModel(){const e=this.model.state.value();this.value!==e&&(this.value=e)}syncFromModelAndMaybeEmit(e,t){const s=this.model.state.value();if(this.value=s,this.syncFormAssociatedState(),!t||s===e)return;const a={value:s};this.dispatchInput(a),this.dispatchChange(a)}applyProgrammaticMutation(e){const t=this.model.state.value();e(),this.draftValue=null,this.syncFromModelAndMaybeEmit(t,!1)}normalizeTimes(e){if(!Number.isFinite(e))return 1;const t=Math.floor(Math.abs(e));return Math.max(t,1)}commitDraftFromInput(e){const s=(this.draftValue??this.inputElement?.value??String(this.model.state.value())).trim();if(s===""){this.draftValue=null,this.syncValueFromModel(),this.syncFormAssociatedState();return}const a=Number(s);if(!Number.isFinite(a)){this.draftValue=null,this.syncValueFromModel(),this.syncFormAssociatedState();return}const r=this.model.state.value();this.model.actions.setValue(a),this.draftValue=null,this.syncFromModelAndMaybeEmit(r,e)}hasValidityErrors(e){return e.customError===!0||e.valueMissing===!0||e.rangeUnderflow===!0||e.rangeOverflow===!0||e.stepMismatch===!0}getValidityState(){const e=this.model.state.value(),t=this.toFiniteOrUndefined(this.min),s=this.toFiniteOrUndefined(this.max),a=Number.isFinite(this.step)&&this.step>0?this.step:1,r=t??0,o={};this.customValidityMessage&&(o.customError=!0),this.required&&!Number.isFinite(e)&&(o.valueMissing=!0),t!=null&&e<t-ls&&(o.rangeUnderflow=!0),s!=null&&e>s+ls&&(o.rangeOverflow=!0);const n=(e-r)/a;Math.abs(n-Math.round(n))>ls&&(o.stepMismatch=!0);let l="";return o.customError?l=this.customValidityMessage:o.valueMissing?l="Please fill out this field.":o.rangeUnderflow?l=`Value must be greater than or equal to ${t}.`:o.rangeOverflow?l=`Value must be less than or equal to ${s}.`:o.stepMismatch&&(l=`Value must align with step ${a}.`),{flags:o,message:l}}handleInput(e){if(this.readOnly||this.isEffectivelyDisabled())return;const t=e.currentTarget;this.draftValue=t?.value??"",this.syncFormAssociatedState()}handleInputBlur(){this.commitDraftFromInput(!0)}handleSpinbuttonKeyDown(e){if(e.key==="Enter"){e.preventDefault(),this.commitDraftFromInput(!0);return}if(!hc.has(e.key))return;e.preventDefault();const t=this.model.state.value();this.model.contracts.getSpinbuttonProps().onKeyDown(e),this.draftValue=null,this.syncFromModelAndMaybeEmit(t,!0)}handleIncrementClick(){const e=this.model.state.value();this.model.contracts.getIncrementButtonProps().onClick(),this.draftValue=null,this.syncFromModelAndMaybeEmit(e,!0)}handleDecrementClick(){const e=this.model.state.value();this.model.contracts.getDecrementButtonProps().onClick(),this.draftValue=null,this.syncFromModelAndMaybeEmit(e,!0)}render(){const e=this.model.contracts.getSpinbuttonProps(),t=this.model.contracts.getIncrementButtonProps(),s=this.model.contracts.getDecrementButtonProps(),a=this.draftValue??String(this.model.state.value());return q`
      <div part="base">
        <input
          id=${e.id}
          role=${e.role}
          tabindex=${e.tabindex}
          aria-valuenow=${e["aria-valuenow"]}
          aria-valuemin=${e["aria-valuemin"]??y}
          aria-valuemax=${e["aria-valuemax"]??y}
          aria-valuetext=${e["aria-valuetext"]??y}
          aria-disabled=${e["aria-disabled"]??y}
          aria-readonly=${e["aria-readonly"]??y}
          aria-label=${e["aria-label"]??y}
          aria-labelledby=${e["aria-labelledby"]??y}
          aria-describedby=${e["aria-describedby"]??y}
          ?disabled=${this.isEffectivelyDisabled()}
          ?readonly=${this.readOnly}
          inputmode="decimal"
          part="input"
          .value=${a}
          @input=${this.handleInput}
          @blur=${this.handleInputBlur}
          @keydown=${this.handleSpinbuttonKeyDown}
        />
        <div part="actions">
          <button
            id=${t.id}
            tabindex=${t.tabindex}
            aria-label=${t["aria-label"]}
            aria-disabled=${t["aria-disabled"]??y}
            ?disabled=${t["aria-disabled"]==="true"}
            part="increment"
            type="button"
            @click=${this.handleIncrementClick}
          >
            +
          </button>
          <button
            id=${s.id}
            tabindex=${s.tabindex}
            aria-label=${s["aria-label"]}
            aria-disabled=${s["aria-disabled"]??y}
            ?disabled=${s["aria-disabled"]==="true"}
            part="decrement"
            type="button"
            @click=${this.handleDecrementClick}
          >
            -
          </button>
        </div>
      </div>
    `}}const xs=45,ji=2*Math.PI*xs;class Pa extends de{static elementName="cv-spinner";static get properties(){return{label:{type:String,reflect:!0}}}model;constructor(){super(),this.label="Loading",this.model=pn({label:this.label})}static styles=[Q`
      :host {
        display: inline-block;
        inline-size: 1em;
        block-size: 1em;
        line-height: 0;
      }

      [part='base'] {
        inline-size: 100%;
        block-size: 100%;
      }

      [part='track'] {
        fill: none;
        stroke: var(--cv-spinner-track-color, var(--cv-color-border, #2a3245));
        stroke-width: var(--cv-spinner-track-width, 4px);
      }

      [part='indicator'] {
        fill: none;
        stroke: var(--cv-spinner-indicator-color, var(--cv-color-primary, #65d7ff));
        stroke-width: var(--cv-spinner-track-width, 4px);
        stroke-linecap: round;
        stroke-dasharray: ${ji};
        stroke-dashoffset: ${ji*.75};
        transform-origin: 50% 50%;
        animation: cv-spinner-rotate var(--cv-spinner-speed, 600ms) linear infinite;
      }

      @keyframes cv-spinner-rotate {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}willUpdate(e){super.willUpdate(e),e.has("label")&&this.model.actions.setLabel(this.label)}render(){const e=this.model.contracts.getSpinnerProps();return nr`
      <svg
        part="base"
        viewBox="0 0 100 100"
        role=${e.role}
        aria-label=${e["aria-label"]}
      >
        <circle
          part="track"
          cx="50"
          cy="50"
          r="${xs}"
        ></circle>
        <circle
          part="indicator"
          cx="50"
          cy="50"
          r="${xs}"
        ></circle>
      </svg>
    `}}let vc=0;class fc extends Le{static elementName="cv-switch";static get properties(){return{name:{type:String},value:{type:String},checked:{type:Boolean,reflect:!0},disabled:{type:Boolean,reflect:!0},required:{type:Boolean,reflect:!0},size:{type:String,reflect:!0},helpText:{type:String,attribute:"help-text",reflect:!0}}}idBase=`cv-switch-${++vc}`;helpTextId=`${this.idBase}-help-text`;modelOptions;model;_hasSlottedHelpText=!1;defaultChecked=!1;didCaptureDefaultChecked=!1;constructor(){super(),this.name="",this.value="on",this.checked=!1,this.disabled=!1,this.required=!1,this.size="medium",this.helpText="",this.modelOptions={idBase:this.idBase,isOn:this.checked,isDisabled:this.isEffectivelyDisabled()},this.model=wo(this.modelOptions)}static styles=[Q`
      :host {
        display: inline-block;
        --cv-switch-width: 44px;
        --cv-switch-height: 24px;
        --cv-switch-thumb-size: 18px;
        --cv-switch-gap: var(--cv-space-2, 8px);
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-switch-gap);
        cursor: pointer;
        flex-wrap: wrap;
      }

      [part='control'] {
        display: inline-flex;
        align-items: center;
        inline-size: var(--cv-switch-width);
        block-size: var(--cv-switch-height);
        padding: 2px;
        border-radius: 999px;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        flex-shrink: 0;
        position: relative;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='thumb'] {
        inline-size: var(--cv-switch-thumb-size);
        block-size: var(--cv-switch-thumb-size);
        border-radius: 50%;
        background: var(--cv-color-text-muted, #9aa6bf);
        transform: translateX(0);
        transition:
          transform var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='toggled'],
      [part='untoggled'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      :host([checked]) [part='control'] {
        border-color: var(--cv-color-primary, #65d7ff);
        background: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 25%,
          var(--cv-color-surface-elevated, #1d2432)
        );
      }

      :host([checked]) [part='thumb'] {
        transform: translateX(calc(var(--cv-switch-width) - var(--cv-switch-thumb-size) - 6px));
        background: var(--cv-color-primary, #65d7ff);
      }

      [part='control']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
        cursor: not-allowed;
      }

      :host([size='small']) {
        --cv-switch-width: 36px;
        --cv-switch-height: 20px;
        --cv-switch-thumb-size: 14px;
      }

      :host([size='large']) {
        --cv-switch-width: 52px;
        --cv-switch-height: 28px;
        --cv-switch-thumb-size: 22px;
      }

      [part='help-text'] {
        display: block;
        inline-size: 100%;
        color: var(--cv-switch-help-text-color, var(--cv-color-text-muted, #9aa6bf));
        font-size: var(--cv-switch-help-text-font-size, 0.85em);
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}get hasHelpText(){return this.helpText!==""||this._hasSlottedHelpText}connectedCallback(){super.connectedCallback(),this.didCaptureDefaultChecked||(this.defaultChecked=this.checked,this.didCaptureDefaultChecked=!0)}willUpdate(e){super.willUpdate(e),e.has("helpText")&&(this.modelOptions.ariaDescribedBy=this.hasHelpText?this.helpTextId:void 0),e.has("disabled")&&this.model.actions.setDisabled(this.isEffectivelyDisabled()),e.has("checked")&&this.model.state.isOn()!==this.checked&&this.model.actions.setOn(this.checked),(e.has("checked")||e.has("disabled")||e.has("required")||e.has("name")||e.has("value"))&&this.syncFormAssociatedState()}handleHelpTextSlotChange(e){const s=e.target.assignedNodes({flatten:!0}),a=this._hasSlottedHelpText;this._hasSlottedHelpText=s.length>0,a!==this._hasSlottedHelpText&&(this.modelOptions.ariaDescribedBy=this.hasHelpText?this.helpTextId:void 0,this.requestUpdate())}dispatchSwitchEvent(e,t){this.dispatchEvent(new CustomEvent(e,{detail:t,bubbles:!0,composed:!0}))}dispatchInput(e){this.dispatchSwitchEvent("cv-input",e)}dispatchChange(e){this.dispatchSwitchEvent("cv-change",e)}syncFromModelAndEmit(e){const t=this.model.state.isOn();if(this.checked=t,this.syncFormAssociatedState(),e===t)return;const s={checked:t};this.dispatchInput(s),this.dispatchChange(s)}onFormDisabledChanged(e){this.model.actions.setDisabled(this.isEffectivelyDisabled())}onFormReset(){this.checked=this.defaultChecked,this.model.actions.setOn(this.defaultChecked)}onFormStateRestore(e){const t=typeof e=="string";this.checked=t,this.model.actions.setOn(t)}isFormAssociatedDisabled(){return this.isEffectivelyDisabled()}getFormAssociatedValue(){return this.checked?this.value||"on":null}getFormAssociatedValidity(){return this.required&&!this.checked?{flags:{valueMissing:!0},message:"Please turn this switch on."}:{flags:{}}}isEffectivelyDisabled(){return this.disabled||this.formDisabled}handleClick(){const e=this.model.state.isOn();this.model.contracts.getSwitchProps().onClick(),this.syncFromModelAndEmit(e)}handleKeyDown(e){const t=this.model.state.isOn();this.model.contracts.getSwitchProps().onKeyDown(e),this.syncFromModelAndEmit(t)}render(){const e=this.model.contracts.getSwitchProps(),t=this.model.state.isOn();return q`
      <div part="base" @click=${this.handleClick}>
        <div
          id=${e.id}
          role=${e.role}
          tabindex=${e.tabindex}
          aria-checked=${e["aria-checked"]}
          aria-disabled=${e["aria-disabled"]}
          aria-required=${this.required?"true":y}
          aria-labelledby=${e["aria-labelledby"]??y}
          aria-describedby=${e["aria-describedby"]??y}
          part="control"
          @keydown=${this.handleKeyDown}
        >
          <span part="toggled" ?hidden=${!t}><slot name="toggled"></slot></span>
          <span part="untoggled" ?hidden=${t}><slot name="untoggled"></slot></span>
          <span part="thumb"></span>
        </div>
        <span part="label"><slot></slot></span>
        ${this.hasHelpText?q`<span part="help-text" id=${this.helpTextId}>
              <slot name="help-text" @slotchange=${this.handleHelpTextSlotChange}>${this.helpText}</slot>
            </span>`:q`<slot
              name="help-text"
              @slotchange=${this.handleHelpTextSlotChange}
              style="display:none"
            ></slot>`}
      </div>
    `}}class Fa extends ve{static elementName="cv-table-cell";static get properties(){return{column:{type:String,reflect:!0},rowHeader:{type:Boolean,attribute:"row-header",reflect:!0},colspan:{type:Number,reflect:!0},rowspan:{type:Number,reflect:!0}}}constructor(){super(),this.column="",this.rowHeader=!1,this.colspan=0,this.rowspan=0}static styles=[Q`
      :host {
        display: table-cell;
        padding: var(--cv-table-cell-padding-block, var(--cv-space-2, 8px)) var(--cv-table-cell-padding-inline, var(--cv-space-3, 12px));
        border-bottom: 1px solid color-mix(in oklab, var(--cv-color-border, #2a3245) 70%, transparent);
        color: var(--cv-color-text, #e8ecf6);
      }

      :host([row-header]) {
        font-weight: 600;
      }

      :host([data-active="true"]) {
        outline: 2px solid var(--cv-table-focus-outline-color, var(--cv-color-primary, #65d7ff));
        outline-offset: -2px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<slot></slot>`}}class Na extends ve{static elementName="cv-table-column";static get properties(){return{value:{type:String,reflect:!0},label:{type:String,reflect:!0},index:{type:Number,reflect:!0},sortable:{type:Boolean,reflect:!0},sortDirection:{type:String,attribute:"sort-direction",reflect:!0}}}constructor(){super(),this.value="",this.label="",this.index=0,this.sortable=!1,this.sortDirection="none"}static styles=[Q`
      :host {
        display: table-cell;
        padding: var(--cv-space-2, 8px) var(--cv-space-3, 12px);
        border-bottom: 1px solid var(--cv-color-border, #2a3245);
        font-weight: 600;
        color: var(--cv-color-text, #e8ecf6);
        background: color-mix(in oklab, var(--cv-color-surface, #141923) 82%, transparent);
        outline: none;
      }

      :host([sortable]) {
        cursor: pointer;
      }

      :host(:focus-visible) {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: -2px;
      }

      :host([sort-direction='ascending']),
      :host([sort-direction='descending']) {
        color: var(--cv-color-primary, #65d7ff);
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-space-1, 4px);
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){const e=this.sortDirection==="ascending"?"▲":this.sortDirection==="descending"?"▼":y;return q`<span part="base"><slot>${this.label}</slot>${e}</span>`}}class Va extends ve{static elementName="cv-table-row";static get properties(){return{value:{type:String,reflect:!0},index:{type:Number,reflect:!0},selected:{type:Boolean,reflect:!0}}}constructor(){super(),this.value="",this.index=0,this.selected=!1}static styles=[Q`
      :host {
        display: table-row;
      }

      :host([selected]) {
        background: var(
          --cv-table-row-selected-background,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 12%, transparent)
        );
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}handleSlotChange(){this.dispatchEvent(new CustomEvent("cv-table-row-slotchange",{bubbles:!0,composed:!0}))}render(){return q`<slot @slotchange=${this.handleSlotChange}></slot>`}}const bc=["none","ascending","descending"],gc=new Set(["Enter"," ","Spacebar"]);let yc=0;class xc extends de{static elementName="cv-table";static get properties(){return{sortColumn:{type:String,attribute:"sort-column",reflect:!0},sortDirection:{type:String,attribute:"sort-direction",reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},ariaLabelledBy:{type:String,attribute:"aria-labelledby"},totalColumnCount:{type:Number,attribute:"total-column-count",reflect:!0},totalRowCount:{type:Number,attribute:"total-row-count",reflect:!0},selectable:{type:String,reflect:!0},interactive:{type:Boolean,reflect:!0},stickyHeader:{type:Boolean,attribute:"sticky-header",reflect:!0},striped:{type:Boolean,reflect:!0},compact:{type:Boolean,reflect:!0},bordered:{type:Boolean,reflect:!0},pageSize:{type:Number,attribute:"page-size",reflect:!0}}}idBase=`cv-table-${++yc}`;columnRecords=[];rowRecords=[];columnListeners=new WeakMap;rowListeners=new WeakMap;model;prevFocusedRowIndex=null;prevFocusedColumnIndex=null;constructor(){super(),this.sortColumn="",this.sortDirection="none",this.ariaLabel="",this.ariaLabelledBy="",this.totalColumnCount=0,this.totalRowCount=0,this.selectable=void 0,this.interactive=!1,this.stickyHeader=!1,this.striped=!1,this.compact=!1,this.bordered=!1,this.pageSize=10,this.model=bi({idBase:this.idBase,columns:[],rows:[],ariaLabel:"Table"})}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: table;
        inline-size: 100%;
        border-collapse: collapse;
        border-spacing: 0;
        border: 1px solid var(--cv-table-border-color, var(--cv-color-border, #2a3245));
        border-radius: var(--cv-table-border-radius, var(--cv-radius-md, 10px));
        overflow: hidden;
        background: var(--cv-table-background, var(--cv-color-surface, #141923));
      }

      [part='head'] {
        display: table-header-group;
      }

      [part='head-row'] {
        display: table-row;
        background: var(
          --cv-table-header-background,
          color-mix(in oklab, var(--cv-color-surface, #141923) 82%, transparent)
        );
      }

      :host([sticky-header]) [part='head-row'] {
        position: sticky;
        top: 0;
        z-index: 1;
      }

      [part='body'] {
        display: table-row-group;
      }

      :host([striped]) ::slotted(cv-table-row:nth-child(even)) {
        background: var(
          --cv-table-stripe-background,
          color-mix(in oklab, var(--cv-color-surface, #141923) 90%, transparent)
        );
      }

      :host([compact]) ::slotted(cv-table-row) {
        --cv-table-cell-padding-block: var(--cv-table-compact-cell-padding-block, var(--cv-space-1, 4px));
        --cv-table-cell-padding-inline: var(--cv-table-compact-cell-padding-inline, var(--cv-space-2, 8px));
      }

      :host([bordered]) ::slotted(cv-table-row) {
        --cv-table-cell-border: 1px solid var(--cv-table-border-color, var(--cv-color-border, #2a3245));
      }

      :host([interactive]) {
        outline: none;
      }

      :host([selectable]) ::slotted(cv-table-row) {
        cursor: pointer;
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-table-focus-outline-color, var(--cv-color-primary, #65d7ff));
        outline-offset: -2px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.rebuildModelFromSlot(!1,!1)}disconnectedCallback(){super.disconnectedCallback(),this.detachColumnListeners(),this.detachRowListeners()}willUpdate(e){if(super.willUpdate(e),e.has("ariaLabel")||e.has("ariaLabelledBy")||e.has("totalColumnCount")||e.has("totalRowCount")||e.has("selectable")||e.has("interactive")||e.has("pageSize")){this.rebuildModelFromSlot(!0,!1);return}if(e.has("sortColumn")||e.has("sortDirection")){const t=this.sortColumn.trim()||null,s=this.normalizeSortDirection(this.sortDirection),a=this.captureSortState();if(a.sortColumnId===t&&a.sortDirection===s)return;const r=a;!t||s==="none"?this.model.actions.clearSort():this.model.actions.sortBy(t,s),this.applySortInteraction(r)}}updated(e){super.updated(e),!e.has("sortColumn")&&!e.has("sortDirection")&&this.syncElementsFromModel()}normalizeSortDirection(e){return bc.includes(e)?e:"none"}resolveIndex(e){if(!(!Number.isFinite(e)||e<1))return Math.floor(e)}resolveSpan(e){if(!(!Number.isFinite(e)||e<2))return Math.floor(e)}getColumnElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===Na.elementName)}getRowElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===Va.elementName)}getCellElements(e){return Array.from(e.children).filter(t=>t.tagName.toLowerCase()===Fa.elementName)}ensureColumnValue(e,t){const s=e.value?.trim();if(s)return s;const a=`column-${t+1}`;return e.value=a,a}ensureRowValue(e,t){const s=e.value?.trim();if(s)return s;const a=`row-${t+1}`;return e.value=a,a}resolveCellColumnId(e,t){const s=e.column?.trim();if(s)return s;const a=this.columnRecords[t]?.id??"";return e.column=a,a}captureSortState(){return{sortColumnId:this.model.state.sortColumnId(),sortDirection:this.model.state.sortDirection()}}rebuildModelFromSlot(e,t=!0){const s=e?this.captureSortState():{sortColumnId:this.sortColumn.trim()||null,sortDirection:this.normalizeSortDirection(this.sortDirection)};this.detachColumnListeners(),this.detachRowListeners(),this.columnRecords=this.getColumnElements().map((d,u)=>{const h=this.ensureColumnValue(d,u);return d.slot="columns",{id:h,index:this.resolveIndex(d.index),sortable:d.sortable,element:d}});const a=new Set(this.columnRecords.map(d=>d.id));this.rowRecords=this.getRowElements().map((d,u)=>{const h=this.ensureRowValue(d,u);d.slot="rows";const p=this.getCellElements(d).map((v,g)=>({columnId:this.resolveCellColumnId(v,g),rowHeader:v.rowHeader,colspan:this.resolveSpan(v.colspan),rowspan:this.resolveSpan(v.rowspan),element:v}));return{id:h,index:this.resolveIndex(d.index),cells:p,element:d}});const r=s.sortColumnId&&a.has(s.sortColumnId)?s.sortColumnId:null,o=r?s.sortDirection:"none",n=this.ariaLabel.trim(),l=this.ariaLabelledBy.trim();this.model=bi({idBase:this.idBase,columns:this.columnRecords.map(d=>({id:d.id,index:d.index})),rows:this.rowRecords.map(d=>({id:d.id,index:d.index})),totalColumnCount:this.totalColumnCount>0?this.totalColumnCount:void 0,totalRowCount:this.totalRowCount>0?this.totalRowCount:void 0,ariaLabel:n||(l?void 0:"Table"),ariaLabelledBy:l||void 0,initialSortColumnId:r,initialSortDirection:o,selectable:this.selectable||!1,interactive:this.interactive,pageSize:this.pageSize>0?this.pageSize:10}),this.attachColumnListeners(),this.attachRowListeners(),this.syncElementsFromModel(),this.syncControlledValuesFromModel(),t&&this.requestUpdate()}detachColumnListeners(){for(const e of this.columnRecords){const t=this.columnListeners.get(e.element);t&&(e.element.removeEventListener("click",t.click),e.element.removeEventListener("keydown",t.keydown),this.columnListeners.delete(e.element))}}attachColumnListeners(){for(const e of this.columnRecords){const t=()=>this.handleColumnClick(e.id,e.sortable),s=a=>this.handleColumnKeyDown(a,e.id,e.sortable);e.element.addEventListener("click",t),e.element.addEventListener("keydown",s),this.columnListeners.set(e.element,{click:t,keydown:s})}}detachRowListeners(){for(const e of this.rowRecords){const t=this.rowListeners.get(e.element);t&&(e.element.removeEventListener("click",t),this.rowListeners.delete(e.element))}}attachRowListeners(){if(this.selectable)for(const e of this.rowRecords){const t=()=>this.handleRowClick(e.id);e.element.addEventListener("click",t),this.rowListeners.set(e.element,t)}}handleRowClick(e){this.selectable&&(this.selectable==="single"?this.model.actions.selectRow(e):this.model.actions.toggleRowSelection(e),this.syncElementsFromModel(),this.dispatchSelectionChange())}dispatchSelectionChange(){const e=this.model.state.selectedRowIds(),t={selectedRowIds:Array.from(e),selectable:this.selectable};this.dispatchEvent(new CustomEvent("cv-selection-change",{detail:t,bubbles:!0,composed:!0}))}dispatchFocusChange(){const e={rowIndex:this.model.state.focusedRowIndex(),columnIndex:this.model.state.focusedColumnIndex()};this.dispatchEvent(new CustomEvent("cv-focus-change",{detail:e,bubbles:!0,composed:!0}))}handleGridKeyDown(e){if(!this.interactive)return;const t=this.model.state.focusedRowIndex(),s=this.model.state.focusedColumnIndex();this.model.actions.handleKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey});const a=this.model.state.focusedRowIndex(),r=this.model.state.focusedColumnIndex(),o=new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End","PageUp","PageDown"," "]),n=e.ctrlKey||e.metaKey,l=(e.key==="a"||e.key==="A")&&n;(o.has(e.key)||l)&&e.preventDefault(),(a!==t||r!==s)&&(this.syncElementsFromModel(),this.dispatchFocusChange()),e.key===" "&&this.selectable&&(this.syncElementsFromModel(),this.dispatchSelectionChange()),l&&this.selectable==="multi"&&(this.syncElementsFromModel(),this.dispatchSelectionChange())}syncControlledValuesFromModel(){this.sortColumn=this.model.state.sortColumnId()??"",this.sortDirection=this.model.state.sortDirection()}syncElementsFromModel(){const e=new Set(this.columnRecords.map(t=>t.id));for(const t of this.columnRecords){const s=this.model.contracts.getColumnHeaderProps(t.id);t.element.id=s.id,t.element.slot="columns",t.element.setAttribute("role",s.role),t.element.setAttribute("aria-colindex",String(s["aria-colindex"])),t.element.setAttribute("aria-sort",s["aria-sort"]??"none"),t.element.sortDirection=s["aria-sort"]??"none",t.element.sortable=t.sortable,t.sortable?t.element.setAttribute("tabindex","0"):t.element.removeAttribute("tabindex")}for(const t of this.rowRecords){const s=this.model.contracts.getRowProps(t.id);t.element.id=s.id,t.element.slot="rows",t.element.setAttribute("role",s.role),t.element.setAttribute("aria-rowindex",String(s["aria-rowindex"])),s["aria-selected"]!=null?(t.element.setAttribute("aria-selected",s["aria-selected"]),t.element.selected=s["aria-selected"]==="true"):(t.element.removeAttribute("aria-selected"),t.element.selected=!1);for(const a of t.cells){const r=e.has(a.columnId);if(a.element.hidden=!r,!r)continue;if(a.rowHeader){const n=this.model.contracts.getRowHeaderProps(t.id,a.columnId);a.element.id=n.id,a.element.setAttribute("role",n.role),a.element.setAttribute("aria-rowindex",String(n["aria-rowindex"])),a.element.setAttribute("aria-colindex",String(n["aria-colindex"])),a.element.removeAttribute("aria-colspan"),a.element.removeAttribute("aria-rowspan"),a.element.removeAttribute("tabindex"),a.element.removeAttribute("data-active");continue}const o=this.model.contracts.getCellProps(t.id,a.columnId,{colspan:a.colspan,rowspan:a.rowspan});a.element.id=o.id,a.element.setAttribute("role",o.role),a.element.setAttribute("aria-colindex",String(o["aria-colindex"])),a.element.removeAttribute("aria-rowindex"),o["aria-colspan"]?a.element.setAttribute("aria-colspan",String(o["aria-colspan"])):a.element.removeAttribute("aria-colspan"),o["aria-rowspan"]?a.element.setAttribute("aria-rowspan",String(o["aria-rowspan"])):a.element.removeAttribute("aria-rowspan"),o.tabindex!=null?a.element.setAttribute("tabindex",o.tabindex):a.element.removeAttribute("tabindex"),o["data-active"]!=null?a.element.setAttribute("data-active",o["data-active"]):a.element.removeAttribute("data-active")}}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}applySortInteraction(e){this.syncElementsFromModel();const t=this.captureSortState();if(this.syncControlledValuesFromModel(),e.sortColumnId===t.sortColumnId&&e.sortDirection===t.sortDirection)return;const s={sortColumnId:t.sortColumnId,sortDirection:t.sortDirection};this.dispatchInput(s),this.dispatchChange(s)}nextSortDirection(e){const t=this.model.state.sortColumnId(),s=this.model.state.sortDirection();return t!==e||s==="none"?"ascending":s==="ascending"?"descending":"none"}handleColumnClick(e,t){if(!t)return;const s=this.captureSortState(),a=this.nextSortDirection(e);a==="none"?this.model.actions.sortBy(e,"none"):this.model.actions.sortBy(e,a),this.applySortInteraction(s)}handleColumnKeyDown(e,t,s){s&&gc.has(e.key)&&(e.preventDefault(),this.handleColumnClick(t,s))}handleColumnsSlotChange(){this.rebuildModelFromSlot(!0,!0)}handleRowsSlotChange(){this.rebuildModelFromSlot(!0,!0)}handleRowSlotChange(){this.rebuildModelFromSlot(!0,!0)}render(){const e=this.model.contracts.getTableProps();return q`
      <div
        id=${e.id}
        role=${e.role}
        aria-label=${e["aria-label"]??y}
        aria-labelledby=${e["aria-labelledby"]??y}
        aria-colcount=${String(e["aria-colcount"])}
        aria-rowcount=${String(e["aria-rowcount"])}
        aria-multiselectable=${e["aria-multiselectable"]??y}
        tabindex=${e.tabindex??y}
        part="base"
        @keydown=${this.handleGridKeyDown}
      >
        <div role="rowgroup" part="head">
          <div role="row" part="head-row">
            <slot name="columns" @slotchange=${this.handleColumnsSlotChange}></slot>
          </div>
        </div>
        <div role="rowgroup" part="body" @cv-table-row-slotchange=${this.handleRowSlotChange}>
          <slot name="rows" @slotchange=${this.handleRowsSlotChange}></slot>
        </div>
      </div>
    `}}let wc=0;class $c extends Le{static elementName="cv-textarea";static get properties(){return{value:{type:String},placeholder:{type:String},disabled:{type:Boolean,reflect:!0},readonly:{type:Boolean,reflect:!0},required:{type:Boolean,reflect:!0},rows:{type:Number},cols:{type:Number},minLength:{type:Number,attribute:"minlength"},maxLength:{type:Number,attribute:"maxlength"},resize:{type:String,reflect:!0},size:{type:String,reflect:!0},variant:{type:String,reflect:!0},name:{type:String}}}model;valueOnFocus="";defaultValue="";didCaptureDefaultValue=!1;constructor(){super(),this.value="",this.placeholder="",this.disabled=!1,this.readonly=!1,this.required=!1,this.rows=4,this.cols=20,this.minLength=void 0,this.maxLength=void 0,this.resize="vertical",this.size="medium",this.variant="outlined",this.name="",this.model=this.createModel()}static styles=[Q`
      :host {
        display: block;
        --cv-textarea-min-height: 96px;
        --cv-textarea-padding-inline: var(--cv-space-3, 12px);
        --cv-textarea-padding-block: var(--cv-space-2, 8px);
        --cv-textarea-font-size: var(--cv-font-size-base, 14px);
        --cv-textarea-border-radius: var(--cv-radius-sm, 6px);
        --cv-textarea-border-color: var(--cv-color-border, #2a3245);
        --cv-textarea-background: transparent;
        --cv-textarea-color: var(--cv-color-text, #e8ecf6);
        --cv-textarea-placeholder-color: var(--cv-color-text-muted, #6b7a99);
        --cv-textarea-focus-ring: 0 0 0 2px var(--cv-color-primary, #65d7ff);
        --cv-textarea-transition-duration: var(--cv-duration-fast, 120ms);
      }

      [part='base'] {
        display: block;
        border: 1px solid var(--cv-textarea-border-color);
        border-radius: var(--cv-textarea-border-radius);
        background: var(--cv-textarea-background);
        color: var(--cv-textarea-color);
        transition:
          border-color var(--cv-textarea-transition-duration) var(--cv-easing-standard, ease),
          background var(--cv-textarea-transition-duration) var(--cv-easing-standard, ease),
          box-shadow var(--cv-textarea-transition-duration) var(--cv-easing-standard, ease);
        box-sizing: border-box;
        width: 100%;
      }

      [part='textarea'] {
        display: block;
        box-sizing: border-box;
        width: 100%;
        min-height: var(--cv-textarea-min-height);
        border: 0;
        outline: none;
        margin: 0;
        resize: vertical;
        border-radius: inherit;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: var(--cv-textarea-font-size);
        line-height: 1.5;
        padding-inline: var(--cv-textarea-padding-inline);
        padding-block: var(--cv-textarea-padding-block);
      }

      [part='textarea']::placeholder {
        color: var(--cv-textarea-placeholder-color);
      }

      [part='form-control-label'] {
        display: block;
      }

      [part='form-control-help-text'] {
        display: block;
      }

      :host([variant='outlined']) [part='base'] {
        border-color: var(--cv-textarea-border-color);
        background: var(--cv-textarea-background);
      }

      :host([variant='filled']) [part='base'] {
        background: var(--cv-color-surface, #141923);
        border-color: transparent;
      }

      :host([focused]) [part='base'] {
        box-shadow: var(--cv-textarea-focus-ring);
      }

      :host([size='small']) {
        --cv-textarea-min-height: 72px;
        --cv-textarea-padding-inline: var(--cv-space-2, 8px);
        --cv-textarea-font-size: var(--cv-font-size-sm, 13px);
      }

      :host([size='large']) {
        --cv-textarea-min-height: 120px;
        --cv-textarea-padding-inline: var(--cv-space-4, 16px);
        --cv-textarea-font-size: var(--cv-font-size-md, 16px);
      }

      :host([disabled]) {
        pointer-events: none;
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
      }

      :host([readonly]) [part='textarea'] {
        cursor: default;
      }

      :host([resize='none']) [part='textarea'] {
        resize: none;
      }

      :host([resize='vertical']) [part='textarea'] {
        resize: vertical;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.didCaptureDefaultValue||(this.defaultValue=this.value,this.didCaptureDefaultValue=!0)}willUpdate(e){super.willUpdate(e),e.has("value")&&this.model.state.value()!==this.value&&this.model.actions.setValue(this.value),e.has("placeholder")&&this.model.actions.setPlaceholder(this.placeholder),e.has("disabled")&&this.model.actions.setDisabled(this.isEffectivelyDisabled()),e.has("readonly")&&this.model.actions.setReadonly(this.readonly),e.has("required")&&this.model.actions.setRequired(this.required),e.has("rows")&&this.model.actions.setRows(this.rows),e.has("cols")&&this.model.actions.setCols(this.cols),e.has("minLength")&&this.model.actions.setMinLength(this.toNonNegativeIntegerOrUndefined(this.minLength)),e.has("maxLength")&&this.model.actions.setMaxLength(this.toNonNegativeIntegerOrUndefined(this.maxLength)),e.has("resize")&&this.model.actions.setResize(this.normalizeResize(this.resize)),this.toggleAttribute("focused",this.model.state.focused()),this.toggleAttribute("filled",this.model.state.filled()),this.syncFormAssociatedState()}createModel(){return hn({idBase:`cv-textarea-${++wc}`,value:this.value,disabled:this.isEffectivelyDisabled(),readonly:this.readonly,required:this.required,placeholder:this.placeholder,rows:this.rows,cols:this.cols,minLength:this.toNonNegativeIntegerOrUndefined(this.minLength),maxLength:this.toNonNegativeIntegerOrUndefined(this.maxLength),resize:this.normalizeResize(this.resize),onInput:e=>{this.value=e,this.dispatchEvent(new CustomEvent("cv-input",{detail:{value:e},bubbles:!0,composed:!0}))}})}onFormDisabledChanged(e){this.model.actions.setDisabled(this.isEffectivelyDisabled())}onFormReset(){this.value=this.defaultValue,this.model.actions.setValue(this.defaultValue)}onFormStateRestore(e){typeof e=="string"&&(this.value=e,this.model.actions.setValue(e))}isFormAssociatedDisabled(){return this.isEffectivelyDisabled()}getFormAssociatedValue(){return this.model.state.value()}getFormAssociatedValidity(){return this.required&&this.model.state.value().length===0?{flags:{valueMissing:!0},message:"Please fill out this field."}:{flags:{}}}isEffectivelyDisabled(){return this.disabled||this.formDisabled}normalizeResize(e){return e==="none"?"none":"vertical"}toNonNegativeIntegerOrUndefined(e){if(!(typeof e!="number"||!Number.isFinite(e)||e<0))return Math.floor(e)}handleNativeInput(e){const t=e.target;this.model.actions.handleInput(t.value),this.syncFormAssociatedState()}handleNativeFocus(){this.valueOnFocus=this.model.state.value(),this.model.actions.setFocused(!0),this.requestUpdate(),this.dispatchEvent(new CustomEvent("cv-focus",{detail:{},bubbles:!0,composed:!0}))}handleNativeBlur(){this.model.actions.setFocused(!1),this.requestUpdate();const e=this.model.state.value();this.dispatchEvent(new CustomEvent("cv-blur",{detail:{},bubbles:!0,composed:!0})),e!==this.valueOnFocus&&this.dispatchEvent(new CustomEvent("cv-change",{detail:{value:e},bubbles:!0,composed:!0})),this.syncFormAssociatedState()}render(){const e=this.model.contracts.getTextareaProps();return q`
      <span part="form-control-label"><slot name="label"></slot></span>
      <div part="base">
        <textarea
          part="textarea"
          id=${e.id}
          .value=${this.model.state.value()}
          name=${this.name||y}
          tabindex=${e.tabindex}
          rows=${e.rows}
          cols=${e.cols}
          aria-disabled=${e["aria-disabled"]??y}
          aria-readonly=${e["aria-readonly"]??y}
          aria-required=${e["aria-required"]??y}
          placeholder=${e.placeholder??y}
          ?disabled=${e.disabled}
          ?readonly=${e.readonly}
          ?required=${e.required}
          minlength=${e.minlength??y}
          maxlength=${e.maxlength??y}
          @input=${this.handleNativeInput}
          @focus=${this.handleNativeFocus}
          @blur=${this.handleNativeBlur}
        ></textarea>
      </div>
      <span part="form-control-help-text"><slot name="help-text"></slot></span>
    `}}class za extends ve{static elementName="cv-tab";static get properties(){return{value:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0},selected:{type:Boolean,reflect:!0},closable:{type:Boolean,reflect:!0}}}constructor(){super(),this.value="",this.disabled=!1,this.active=!1,this.selected=!1,this.closable=!1}static styles=[Q`
      :host {
        display: inline-block;
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      .tab {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 34px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([active]) .tab {
        border-color: var(--cv-color-primary, #65d7ff);
      }

      :host([selected]) .tab {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 28%, var(--cv-color-surface, #141923));
        border-color: var(--cv-color-primary, #65d7ff);
      }

      :host([disabled]) .tab {
        opacity: 0.5;
      }

      :host(:focus-visible) .tab {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      .close-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 20px;
        block-size: 20px;
        margin-inline-start: var(--cv-space-1, 4px);
        border: 0;
        border-radius: var(--cv-radius-sm, 6px);
        background: transparent;
        color: inherit;
        cursor: pointer;
      }

      .close-button:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      .close-button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}handleCloseClick(e){e.preventDefault(),e.stopPropagation(),!this.disabled&&this.dispatchEvent(new CustomEvent("cv-close",{detail:{value:this.value},bubbles:!0,composed:!0}))}render(){return q`
      <div class="tab" part="base">
        <slot></slot>
        ${this.closable?q`
              <button
                class="close-button"
                part="close-button"
                type="button"
                aria-label="Close tab"
                ?disabled=${this.disabled}
                @click=${this.handleCloseClick}
              >
                &times;
              </button>
            `:null}
      </div>
    `}}class Ka extends ve{static elementName="cv-tab-panel";static get properties(){return{tab:{type:String,reflect:!0},selected:{type:Boolean,reflect:!0}}}constructor(){super(),this.tab="",this.selected=!1}static styles=[Q`
      :host {
        display: block;
        color: var(--cv-color-text, #e8ecf6);
      }

      :host([hidden]) {
        display: none;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<div part="base"><slot></slot></div>`}}const kc=new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End","Enter"," ","Spacebar"]);let Ic=0;class Sc extends de{static elementName="cv-tabs";static get properties(){return{value:{type:String,reflect:!0},orientation:{type:String,reflect:!0},activationMode:{type:String,attribute:"activation-mode",reflect:!0},ariaLabel:{type:String,attribute:"aria-label"}}}idBase=`cv-tabs-${++Ic}`;tabRecords=[];orphanPanels=[];unsupportedTabs=[];unsupportedPanels=[];tabListeners=new WeakMap;model;pendingCloseRequest=null;constructor(){super(),this.value="",this.orientation="horizontal",this.activationMode="automatic",this.ariaLabel=""}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-2, 8px);
      }

      [part='list'] {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--cv-space-1, 4px);
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        position: relative;
      }

      :host([orientation='vertical']) [part='base'] {
        grid-template-columns: auto 1fr;
        align-items: start;
      }

      :host([orientation='vertical']) [part='list'] {
        flex-direction: column;
        align-items: stretch;
      }

      [part='list']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='indicator'] {
        position: absolute;
        background: var(--cv-tabs-indicator-color, var(--cv-color-primary, #65d7ff));
        transition: transform var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          width var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          height var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
        pointer-events: none;
      }

      :host(:not([orientation='vertical'])) [part='indicator'] {
        bottom: 0;
        left: 0;
        height: var(--cv-tabs-indicator-size, 3px);
        border-radius: var(--cv-tabs-indicator-size, 3px);
      }

      :host([orientation='vertical']) [part='indicator'] {
        top: 0;
        left: 0;
        width: var(--cv-tabs-indicator-size, 3px);
        border-radius: var(--cv-tabs-indicator-size, 3px);
      }

      [part='panels'] {
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: color-mix(in oklab, var(--cv-color-surface, #141923) 75%, transparent);
        padding: var(--cv-space-3, 12px);
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.model||this.rebuildModelFromSlot(!1,!1)}disconnectedCallback(){super.disconnectedCallback(),this.detachTabListeners()}willUpdate(e){if(super.willUpdate(e),e.has("orientation")||e.has("activationMode")||e.has("ariaLabel")){this.rebuildModelFromSlot(!0,!1);return}if(e.has("value")&&this.model){const t=this.value.trim();if(t.length===0)return;if(this.model.state.selectedTabId()!==t){const s=this.model.state.selectedTabId(),a=this.model.state.activeTabId();this.model.actions.select(t),this.applyInteractionResult(s,a)}}}updated(e){super.updated(e),e.has("value")||this.syncTabElements()}isNavTabElement(e){return e.slot==="nav"}isDefaultPanelElement(e){const t=e.getAttribute("slot");return t===null||t.trim().length===0}getAllTabElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===za.elementName)}getTabElements(){return this.getAllTabElements().filter(e=>this.isNavTabElement(e))}getAllPanelElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===Ka.elementName)}getPanelElements(){return this.getAllPanelElements().filter(e=>this.isDefaultPanelElement(e))}ensureTabValue(e,t){const s=e.value?.trim();if(s)return s;const a=`tab-${t+1}`;return e.value=a,a}resolveConfiguredValue(e){const t=this.value.trim();if(t.length>0)return t;for(const[s,a]of e.entries())if(a.selected&&!a.disabled)return this.ensureTabValue(a,s);return null}rebuildModelFromSlot(e,t=!0){const s=this.getAllTabElements(),a=this.getAllPanelElements(),r=this.getTabElements(),o=this.getPanelElements(),n=this.model;this.unsupportedTabs=s.filter(I=>!this.isNavTabElement(I)),this.unsupportedPanels=a.filter(I=>!this.isDefaultPanelElement(I));const l=this.resolveConfiguredValue(r);let d=e?this.model?.state.selectedTabId()??l:l,u=e?this.model?.state.activeTabId()??d:d;const h=this.pendingCloseRequest;let p=!1;h&&!r.some($=>$.value?.trim()===h.id)&&(h.wasSelected&&(d=h.fallbackId),h.wasActive&&(u=h.fallbackId),p=!0,this.pendingCloseRequest=null),this.detachTabListeners();const v=new Map;for(const[I,$]of o.entries()){let T=$.tab?.trim();if(!T){const _=r[I];_&&(T=this.ensureTabValue(_,I),$.tab=T)}!T||v.has(T)||v.set(T,$)}const g=new Set;this.tabRecords=r.map((I,$)=>{const T=this.ensureTabValue(I,$),_=v.get(T);return _&&g.add(_),I.slot="nav",{id:T,disabled:I.disabled,element:I,panel:_}}),this.orphanPanels=o.filter(I=>!g.has(I));const f=new Set(this.tabRecords.filter(I=>!I.disabled).map(I=>I.id)),x=d&&f.has(d)?d:null,m=u&&f.has(u)?u:x??this.tabRecords.find(I=>!I.disabled)?.id??null;if(this.model=so({idBase:this.idBase,tabs:this.tabRecords.map(I=>({id:I.id,disabled:I.disabled})),ariaLabel:this.ariaLabel||void 0,orientation:this.orientation,activationMode:this.activationMode,initialSelectedTabId:x,initialActiveTabId:m}),this.attachTabListeners(),this.syncTabElements(),this.value=this.model.state.selectedTabId()??"",p&&n){const I=n.state.selectedTabId(),$=n.state.activeTabId(),T=this.model.state.selectedTabId(),_=this.model.state.activeTabId(),B=I!==T,A=$!==_;if(B||A){const N={activeTabId:_,selectedTabId:T};this.dispatchInput(N),B&&this.dispatchChange(N),A&&this.focusActiveTab()}}t&&this.requestUpdate()}detachTabListeners(){for(const e of this.tabRecords){const t=this.tabListeners.get(e.element);t&&(e.element.removeEventListener("click",t.click),e.element.removeEventListener("keydown",t.keydown),e.element.removeEventListener("cv-close",t.close),this.tabListeners.delete(e.element))}}attachTabListeners(){if(this.model)for(const e of this.tabRecords){const t=()=>{this.handleTabClick(e.id)},s=r=>{r.stopPropagation(),this.handleTabsKeyDown(r)},a=r=>{this.handleTabClose(r,e.id)};e.element.addEventListener("click",t),e.element.addEventListener("keydown",s),e.element.addEventListener("cv-close",a),this.tabListeners.set(e.element,{click:t,keydown:s,close:a})}}resolveCloseFallbackId(e){const t=this.tabRecords.findIndex(s=>s.id===e);if(t<0)return null;for(let s=t+1;s<this.tabRecords.length;s+=1){const a=this.tabRecords[s];if(a&&!a.disabled&&a.id!==e)return a.id}for(let s=t-1;s>=0;s-=1){const a=this.tabRecords[s];if(a&&!a.disabled&&a.id!==e)return a.id}return null}handleTabClose(e,t){if(!this.model)return;const s=e.detail?.value?.trim()||t,a=this.model.state.activeTabId(),r=this.model.state.selectedTabId(),o=a===s,n=r===s,l=this.resolveCloseFallbackId(s);if(!o&&!n){this.pendingCloseRequest=null;return}if(this.pendingCloseRequest={id:s,wasActive:o,wasSelected:n,fallbackId:l},!l||l===r)return;const d=r,u=a;this.model.actions.select(l),this.applyInteractionResult(d,u)}syncTabElements(){if(this.model){for(const e of this.tabRecords){const t=this.model.contracts.getTabProps(e.id);if(e.element.id=t.id,e.element.slot="nav",e.element.setAttribute("role",t.role),e.element.setAttribute("tabindex",t.tabindex),e.element.setAttribute("aria-selected",t["aria-selected"]),e.element.setAttribute("aria-controls",t["aria-controls"]),t["aria-disabled"]?e.element.setAttribute("aria-disabled",t["aria-disabled"]):e.element.removeAttribute("aria-disabled"),e.element.setAttribute("data-active",t["data-active"]),e.element.setAttribute("data-selected",t["data-selected"]),e.element.disabled=t["aria-disabled"]==="true",e.element.active=t["data-active"]==="true",e.element.selected=t["data-selected"]==="true",!e.panel)continue;const s=this.model.contracts.getPanelProps(e.id);e.panel.removeAttribute("slot"),e.panel.tab=e.id,e.panel.id=s.id,e.panel.setAttribute("role",s.role),e.panel.setAttribute("tabindex",s.tabindex),e.panel.setAttribute("aria-labelledby",s["aria-labelledby"]),e.panel.hidden=s.hidden,e.panel.selected=!s.hidden}for(const e of this.orphanPanels)e.hidden=!0,e.selected=!1;for(const e of this.unsupportedTabs)e.active=!1,e.selected=!1;for(const e of this.unsupportedPanels)e.hidden=!0,e.selected=!1}}focusActiveTab(){if(!this.model)return;const e=this.model.state.activeTabId();if(!e)return;this.tabRecords.find(s=>s.id===e)?.element.focus()}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}applyInteractionResult(e,t){if(!this.model)return;this.syncTabElements();const s=this.model.state.selectedTabId(),a=this.model.state.activeTabId(),r=e!==s,o=t!==a;if(this.value=s??"",!r&&!o)return;const n={activeTabId:a,selectedTabId:s};this.dispatchInput(n),r&&this.dispatchChange(n),o&&this.focusActiveTab()}handleTabClick(e){if(!this.model)return;const t=this.model.state.selectedTabId(),s=this.model.state.activeTabId();this.model.actions.select(e),this.applyInteractionResult(t,s)}handleTabsKeyDown(e){if(!this.model)return;kc.has(e.key)&&e.preventDefault();const t=this.model.state.selectedTabId(),s=this.model.state.activeTabId();this.model.actions.handleKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(t,s)}handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}render(){const e=this.model?.contracts.getTabListProps()??{id:`${this.idBase}-tablist`,role:"tablist","aria-orientation":this.orientation,"aria-label":this.ariaLabel||void 0};return q`
      <div part="base">
        <div
          id=${e.id}
          role=${e.role}
          aria-orientation=${e["aria-orientation"]}
          aria-label=${e["aria-label"]??y}
          part="list"
          @keydown=${this.handleTabsKeyDown}
        >
          <slot name="nav" @slotchange=${this.handleSlotChange}></slot>
          <div part="indicator"></div>
        </div>

        <div part="panels">
          <slot @slotchange=${this.handleSlotChange}></slot>
        </div>
      </div>
    `}}function ws(i={}){const e=an(i);return{model:e,push:t=>e.actions.push(t),dismiss:t=>e.actions.dismiss(t),clear:()=>e.actions.clear(),pause:()=>e.actions.pause(),resume:()=>e.actions.resume()}}class Cc extends de{static elementName="cv-toast";static get properties(){return{level:{type:String,reflect:!0},closable:{type:Boolean,reflect:!0},toastId:{type:String,attribute:"toast-id"},title:{type:String},message:{type:String},iconName:{type:String,attribute:"icon"},progress:{type:Boolean,reflect:!0},paused:{type:Boolean,reflect:!0},durationMs:{type:Number,attribute:!1},actions:{attribute:!1}}}constructor(){super(),this.level="info",this.closable=!0,this.toastId="",this.title="",this.message="",this.iconName="",this.progress=!1,this.paused=!1,this.durationMs=5e3,this.actions=[]}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: start;
        gap: var(--cv-toast-gap, var(--cv-space-2, 8px));
        padding: var(--cv-toast-padding-block, var(--cv-space-3, 12px))
          var(--cv-toast-padding-inline, var(--cv-space-4, 16px));
        border-radius: var(--cv-toast-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-toast-border-color, var(--cv-color-border, #2a3245));
        background: var(--cv-toast-background, var(--cv-color-surface-elevated, #1d2432));
        box-shadow: var(--cv-toast-shadow, var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24)));
        color: var(--cv-toast-color, var(--cv-color-text, #e8ecf6));
        position: relative;
        overflow: hidden;
      }

      [part='base'][data-level='success'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-success, #6ef7c8) 45%,
          var(--cv-color-border, #2a3245)
        );
      }

      [part='base'][data-level='warning'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-warning, #ffd36e) 45%,
          var(--cv-color-border, #2a3245)
        );
      }

      [part='base'][data-level='error'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-danger, #ff7d86) 45%,
          var(--cv-color-border, #2a3245)
        );
      }

      [part='base'][data-level='loading'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 40%,
          var(--cv-color-border, #2a3245)
        );
      }

      [part='icon-wrap'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--cv-toast-accent, var(--cv-color-primary, #65d7ff));
        margin-top: 1px;
      }

      [part='base'][data-level='success'] [part='icon-wrap'] {
        --cv-toast-accent: var(--cv-color-success, #6ef7c8);
      }

      [part='base'][data-level='warning'] [part='icon-wrap'] {
        --cv-toast-accent: var(--cv-color-warning, #ffd36e);
      }

      [part='base'][data-level='error'] [part='icon-wrap'] {
        --cv-toast-accent: var(--cv-color-danger, #ff7d86);
      }

      [part='content'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
        min-inline-size: 0;
      }

      [part='title'] {
        font-size: var(--cv-font-size-sm, 0.875rem);
        font-weight: var(--cv-font-weight-semibold, 600);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='dismiss'] {
        border: 1px solid transparent;
        border-radius: var(--cv-radius-sm, 6px);
        background: transparent;
        color: var(--cv-color-text-muted, #9aa6bf);
        cursor: pointer;
        padding: 0 var(--cv-space-2, 8px);
      }

      [part='dismiss']:hover {
        color: var(--cv-color-text, #e8ecf6);
        border-color: var(--cv-color-border, #2a3245);
      }

      [part='dismiss']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='label'] {
        color: var(--cv-color-text-muted, #9aa6bf);
        line-height: 1.45;
        word-break: break-word;
      }

      [part='actions'] {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cv-space-2, 8px);
        margin-top: var(--cv-space-1, 4px);
      }

      [part='action'] {
        border: 1px solid var(--cv-color-border, #2a3245);
        background: color-mix(in oklab, var(--cv-color-surface-elevated, #1d2432) 88%, white 4%);
        color: var(--cv-color-text, #e8ecf6);
        font: inherit;
        font-size: var(--cv-font-size-xs, 0.75rem);
        font-weight: var(--cv-font-weight-semibold, 600);
        padding: 4px 10px;
        border-radius: var(--cv-radius-sm, 6px);
        cursor: pointer;
      }

      [part='action']:hover {
        border-color: var(--cv-color-primary, #65d7ff);
        color: var(--cv-color-primary, #65d7ff);
      }

      [part='action']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      [part='progress'] {
        position: absolute;
        inset-inline: 0;
        inset-block-end: 0;
        block-size: var(--cv-toast-progress-height, 3px);
        background: linear-gradient(
          90deg,
          var(--cv-toast-accent, var(--cv-color-primary, #65d7ff)) 0%,
          color-mix(in oklab, var(--cv-toast-accent, var(--cv-color-primary, #65d7ff)) 70%, white) 100%
        );
        transform-origin: left center;
      }

      :host([progress]) [part='progress'] {
        animation: cv-toast-progress var(--cv-toast-progress-duration, 5000ms) linear forwards;
        animation-play-state: var(--cv-toast-progress-play-state, running);
        opacity: 0.85;
      }

      :host([paused]) {
        --cv-toast-progress-play-state: paused;
      }

      cv-spinner {
        --cv-spinner-size: 18px;
        --cv-spinner-track-width: 2px;
        color: currentColor;
      }

      cv-icon,
      ::slotted([slot='icon']) {
        inline-size: 18px;
        block-size: 18px;
      }

      @keyframes cv-toast-progress {
        from {
          transform: scaleX(1);
        }
        to {
          transform: scaleX(0);
        }
      }
    `];static define(){ye.define(),Pa.define(),customElements.get(this.elementName)||customElements.define(this.elementName,this)}getRole(){return this.level==="warning"||this.level==="error"?"alert":"status"}handleDismiss(){this.dispatchEvent(new CustomEvent("cv-close",{detail:{id:this.toastId},bubbles:!0,composed:!0}))}handleActionClick(e){const t=e.currentTarget;if(!t)return;const s=Number(t.dataset.actionIndex);this.actions[s]?.onClick?.()}updated(e){super.updated(e),e.has("durationMs")&&this.style.setProperty("--cv-toast-progress-duration",`${Math.max(this.durationMs,0)}ms`)}renderFallbackIcon(){return this.level==="loading"?q`<cv-spinner label="Loading"></cv-spinner>`:this.iconName?q`<cv-icon name=${this.iconName} aria-hidden="true"></cv-icon>`:y}render(){const e=this.getRole(),t=this.actions.length>0,s=this.title.length>0,a=this.message.length>0;return q`
      <div part="base" role=${e} data-level=${this.level}>
        <span part="icon-wrap"><slot name="icon">${this.renderFallbackIcon()}</slot></span>
        <div part="content">
          ${s?q`<span part="title">${this.title}</span>`:y}
          <span part="label">${a?this.message:q`<slot></slot>`}</span>
          ${t?q`
                <div part="actions">
                  ${this.actions.map((r,o)=>q`
                      <button
                        part="action"
                        type="button"
                        data-action-index=${String(o)}
                        @click=${this.handleActionClick}
                      >
                        ${r.label}
                      </button>
                    `)}
                </div>
              `:y}
        </div>
        ${this.closable?q`
              <button
                part="dismiss"
                type="button"
                role="button"
                tabindex="0"
                aria-label="Dismiss notification"
                @click=${this.handleDismiss}
              >
                ×
              </button>
            `:y}
        ${this.progress&&this.durationMs>0?q`<span part="progress"></span>`:y}
      </div>
    `}}class Ec extends de{static elementName="cv-toast-region";static get properties(){return{controller:{attribute:!1},position:{type:String,reflect:!0},maxVisible:{type:Number,attribute:"max-visible",reflect:!0}}}previousToastIds=new Set;constructor(){super(),this.position="top-end",this.maxVisible=3,this.controller=ws({maxVisible:this.maxVisible})}static styles=[Q`
      :host {
        display: block;
        position: fixed;
        z-index: var(--cv-toast-region-z-index, 9999);
        inline-size: var(--cv-toast-region-width, auto);
        max-width: var(--cv-toast-region-max-width, 420px);
        pointer-events: none;
      }

      :host([position='top-start']) {
        top: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
        left: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
      }

      :host([position='top-center']) {
        top: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
        left: 50%;
        transform: translateX(-50%);
      }

      :host([position='top-end']) {
        top: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
        right: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
      }

      :host([position='bottom-start']) {
        bottom: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
        left: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
      }

      :host([position='bottom-center']) {
        bottom: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
        left: 50%;
        transform: translateX(-50%);
      }

      :host([position='bottom-end']) {
        bottom: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
        right: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-toast-region-gap, var(--cv-space-2, 8px));
        pointer-events: auto;
      }

      [part='item'] {
        display: block;
        inline-size: 100%;
      }
    `];static define(){Cc.define(),customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.previousToastIds=new Set(this.controller.model.state.items().map(e=>e.id))}willUpdate(e){super.willUpdate(e),e.has("maxVisible")&&e.get("maxVisible")!==void 0&&(this.controller=ws({maxVisible:this.maxVisible}),this.previousToastIds=new Set)}updated(e){if(super.updated(e),e.has("controller")){this.previousToastIds=new Set(this.controller.model.state.items().map(s=>s.id));return}const t=new Set(this.controller.model.state.items().map(s=>s.id));for(const s of this.previousToastIds)t.has(s)||this.dispatchEvent(new CustomEvent("cv-close",{detail:{id:s},bubbles:!0,composed:!0}));this.previousToastIds=t}handlePause(){this.controller.pause()}handleResume(){this.controller.resume()}handleToastClose(e){const t=e;this.controller.dismiss(t.detail.id)}render(){const e=this.controller.model,t=e.contracts.getRegionProps(),s=e.state.visibleItems(),a=e.state.isPaused();return q`
      <section
        id=${t.id}
        role=${t.role}
        aria-live=${t["aria-live"]}
        aria-atomic=${t["aria-atomic"]}
        part="base"
        data-paused=${a?"true":"false"}
        @mouseenter=${this.handlePause}
        @mouseleave=${this.handleResume}
      >
        ${s.map(r=>{const o=e.contracts.getToastProps(r.id);return q`
            <cv-toast
              id=${o.id}
              role=${o.role}
              data-level=${o["data-level"]}
              part="item"
              .toastId=${r.id}
              .level=${r.level??"info"}
              .closable=${r.closable??!0}
              .title=${r.title??""}
              .message=${r.message}
              .iconName=${r.icon??""}
              .progress=${!!r.progress}
              .durationMs=${r.durationMs??0}
              .paused=${a}
              .actions=${r.actions??[]}
              @cv-close=${this.handleToastClose}
            ></cv-toast>
          `})}
      </section>
    `}}class _a extends ve{static elementName="cv-treegrid-cell";static get properties(){return{column:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0},selected:{type:Boolean,reflect:!0}}}constructor(){super(),this.column="",this.disabled=!1,this.active=!1,this.selected=!1}static styles=[Q`
      :host {
        display: block;
        padding-inline: var(--cv-space-2, 8px);
        padding-block: var(--cv-space-1, 4px);
        color: var(--cv-color-text, #e8ecf6);
        outline: none;
      }

      :host([active]) {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 16%, transparent);
      }

      :host([selected]) {
        font-weight: 600;
      }

      :host([disabled]) {
        opacity: 0.55;
      }

      :host(:focus-visible) {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: -2px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<slot></slot>`}}class Ua extends ve{static elementName="cv-treegrid-column";static get properties(){return{value:{type:String,reflect:!0},label:{type:String,reflect:!0},index:{type:Number,reflect:!0},disabled:{type:Boolean,reflect:!0},cellRole:{type:String,attribute:"cell-role",reflect:!0}}}constructor(){super(),this.value="",this.label="",this.index=0,this.disabled=!1,this.cellRole="gridcell"}static styles=[Q`
      :host {
        display: flex;
        align-items: center;
        min-block-size: 36px;
        padding-inline: var(--cv-space-2, 8px);
        border-bottom: 1px solid var(--cv-color-border, #2a3245);
        font-weight: 600;
        color: var(--cv-color-text, #e8ecf6);
        background: color-mix(in oklab, var(--cv-color-surface, #141923) 82%, transparent);
        outline: none;
      }

      :host([disabled]) {
        opacity: 0.55;
      }

      :host(:focus-visible) {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: -2px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<span><slot>${this.label}</slot></span>`}}class qa extends ve{static elementName="cv-treegrid-row";static get properties(){return{value:{type:String,reflect:!0},index:{type:Number,reflect:!0},disabled:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0},selected:{type:Boolean,reflect:!0},expanded:{type:Boolean,reflect:!0},branch:{type:Boolean,reflect:!0},level:{type:Number,reflect:!0}}}constructor(){super(),this.value="",this.index=0,this.disabled=!1,this.active=!1,this.selected=!1,this.expanded=!1,this.branch=!1,this.level=1}static styles=[Q`
      :host {
        display: block;
        --cv-treegrid-child-indent: var(--cv-treegrid-child-indent, 14px);
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      :host(:focus-visible) [part='row'] {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: -2px;
      }

      :host([active]) [part='row'],
      :host([selected]) [part='row'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 18%, transparent);
      }

      :host([disabled]) [part='row'],
      :host([disabled]) [part='children'] {
        opacity: 0.55;
      }

      [part='row'] {
        display: grid;
        grid-template-columns: repeat(var(--cv-treegrid-column-count, 1), minmax(0, 1fr));
        align-items: center;
        min-block-size: 32px;
        padding-inline: var(--cv-space-2, 8px);
        padding-inline-start: calc(var(--cv-treegrid-child-indent) * max(var(--cv-treegrid-level, 1) - 1, 0));
      }

      [part='children'][hidden] {
        display: none;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}handleSlotChange(){this.dispatchEvent(new CustomEvent("cv-treegrid-row-slotchange",{bubbles:!0,composed:!0}))}render(){return this.style.setProperty("--cv-treegrid-level",String(this.level||1)),q`
      <div part="row">
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
      <div part="children" ?hidden=${!this.expanded}>
        <slot name="children" @slotchange=${this.handleSlotChange}></slot>
      </div>
    `}}const Ac=new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End","Enter"," ","Spacebar"]),Gi=(i,e)=>`${i}::${e}`,Lt=(i,e)=>{if(i.length!==e.length)return!1;const t=new Set(e);return i.every(s=>t.has(s))},Wi=(i,e)=>i?.rowId===e?.rowId&&i?.colId===e?.colId,Yi=i=>[...new Set(i)];let Dc=0;class Lc extends de{static elementName="cv-treegrid";static get properties(){return{value:{type:String,reflect:!0},selectedValues:{attribute:!1},expandedValues:{attribute:!1},selectionMode:{type:String,attribute:"selection-mode",reflect:!0},ariaLabel:{type:String,attribute:"aria-label"},ariaLabelledBy:{type:String,attribute:"aria-labelledby"}}}idBase=`cv-treegrid-${++Dc}`;columnRecords=[];rowRecords=[];cellRecords=[];columnById=new Map;rowById=new Map;cellListeners=new WeakMap;model;_programmaticChange=!1;constructor(){super(),this.value="",this.selectedValues=[],this.expandedValues=[],this.selectionMode="single",this.ariaLabel="",this.ariaLabelledBy="",this.model=Ai({idBase:this.idBase,rows:[],columns:[]})}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: block;
        border: 1px solid var(--cv-color-border, #2a3245);
        border-radius: var(--cv-radius-md, 10px);
        overflow: auto;
        background: var(--cv-color-surface, #141923);
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.rebuildModelFromSlot(!1,!1)}disconnectedCallback(){super.disconnectedCallback(),this.detachCellListeners()}willUpdate(e){if(super.willUpdate(e),e.has("selectionMode")||e.has("ariaLabel")||e.has("ariaLabelledBy")){this.rebuildModelFromSlot(!0,!1);return}if(e.has("value")){const s=this.parseCellValue(this.value.trim())??null;if(s&&!Wi(s,this.model.state.activeCellId())){const a=this.captureSnapshot();this._programmaticChange=!0,this.setActiveCell(s),this.applyInteractionResult(a),this._programmaticChange=!1}}if(e.has("selectedValues")){const t=this.captureSnapshot(),s=this.normalizeRowIds(this.selectedValues);if(!Lt(s,t.selectedRowIds)){if(this._programmaticChange=!0,this.selectionMode==="single"){const a=s.slice(0,1);this.setSelectedRows(a)}else this.setSelectedRows(s);this.applyInteractionResult(t),this._programmaticChange=!1}}if(e.has("expandedValues")){const t=this.captureSnapshot(),s=this.normalizeExpandedValues(this.expandedValues);Lt(s,t.expandedRowIds)||(this._programmaticChange=!0,this.setExpandedRows(s),this.applyInteractionResult(t),this._programmaticChange=!1)}}updated(e){if(super.updated(e),!e.has("value")&&!e.has("selectedValues")&&!e.has("expandedValues")){this.syncElementsFromModel();return}e.has("value")||this.syncElementsFromModel()}getColumnElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===Ua.elementName)}getRowElements(e){return Array.from(e.children).filter(t=>t.tagName.toLowerCase()===qa.elementName)}getCellElements(e){return Array.from(e.children).filter(t=>t.tagName.toLowerCase()===_a.elementName)}resolveIndex(e){if(!(!Number.isFinite(e)||e<1))return Math.floor(e)}ensureColumnValue(e,t){const s=e.value?.trim();if(s)return s;const a=`column-${t+1}`;return e.value=a,a}ensureRowValue(e,t){const s=e.value?.trim();if(s)return s;const a=`row-${t+1}`;return e.value=a,a}resolveCellColumn(e,t){const s=e.column?.trim();return s&&this.columnById.has(s)?s:this.columnRecords[t]?.id??""}parseCellValue(e){const[t,s,...a]=e.split("::");return a.length>0||!t||!s?null:{rowId:t,colId:s}}cellIdToString(e){return e?Gi(e.rowId,e.colId):""}normalizeRowIds(e){const t=e.map(s=>s.trim()).filter(s=>s.length>0);return Yi(t).filter(s=>this.rowById.has(s))}normalizeExpandedValues(e){const t=e.map(s=>s.trim()).filter(s=>s.length>0);return Yi(t).filter(s=>this.rowById.has(s))}captureSnapshot(){return{activeCellId:this.model.state.activeCellId(),selectedRowIds:[...this.model.state.selectedRowIds()],expandedRowIds:[...this.model.state.expandedRowIds()]}}rebuildModelFromSlot(e,t=!0){const s=this.normalizeRowIds(this.selectedValues),a=this.normalizeExpandedValues(this.expandedValues),r=this.parseCellValue(this.value.trim()),o=e?this.captureSnapshot():{activeCellId:r,selectedRowIds:this.selectionMode==="single"?s.slice(0,1):s,expandedRowIds:a};this.detachCellListeners(),this.columnRecords=[],this.rowRecords=[],this.cellRecords=[],this.columnById.clear(),this.rowById.clear(),this.parseColumns();const n=this.parseRows(this),l=this.cellRecords.filter(h=>h.valid),d=o.activeCellId?o.activeCellId:this.value.trim()?this.parseCellValue(this.value):null,u=this.selectionMode==="single"?o.selectedRowIds.slice(0,1):o.selectedRowIds;this.model=Ai({idBase:this.idBase,rows:n,columns:this.columnRecords.map(h=>({id:h.id,index:h.index,disabled:h.disabled,cellRole:h.cellRole})),disabledCells:l.filter(h=>h.disabled).map(h=>({rowId:h.rowId,colId:h.colId})),selectionMode:this.selectionMode,ariaLabel:this.ariaLabel||void 0,ariaLabelledBy:this.ariaLabelledBy||void 0,initialActiveCellId:this.normalizeActiveCell(d,l),initialSelectedRowIds:this.selectionMode==="single"?this.normalizeRowIds(u).slice(0,1):this.normalizeRowIds(u),initialExpandedRowIds:this.normalizeExpandedValues(o.expandedRowIds)}),this.attachCellListeners(),this.syncElementsFromModel(),this.syncControlledValuesFromModel(),t&&this.requestUpdate()}parseColumns(){this.columnRecords=this.getColumnElements().map((e,t)=>({id:this.ensureColumnValue(e,t),index:this.resolveIndex(e.index),disabled:e.disabled,cellRole:e.cellRole,element:e})),this.columnById=new Map(this.columnRecords.map(e=>[e.id,e]))}parseRows(e,t=null){return this.getRowElements(e).map((s,a)=>{const r=this.ensureRowValue(s,a),o=this.parseRows(s,r),n=o.map(u=>u.id);t!=null?s.slot="children":s.slot="";const l={id:r,index:this.resolveIndex(s.index),disabled:s.disabled,parentId:t,children:n,element:s};this.rowRecords.push(l),this.rowById.set(r,l);const d=this.getCellElements(s).map((u,h)=>{const p=this.resolveCellColumn(u,h),v=this.columnById.has(p);return{rowId:r,colId:p,disabled:u.disabled,valid:v,element:u}});return this.cellRecords.push(...d),{id:r,index:this.resolveIndex(s.index),disabled:s.disabled,children:o}})}normalizeActiveCell(e,t){if(!e)return null;const s=this.cellKey(e);return t.some(a=>this.cellKey(a)===s&&a.valid)?e:null}cellKey(e){return Gi(e.rowId,e.colId)}detachCellListeners(){for(const e of this.cellRecords){const t=this.cellListeners.get(e.element);t&&(e.element.removeEventListener("focus",t.focus),e.element.removeEventListener("click",t.click),this.cellListeners.delete(e.element))}}attachCellListeners(){for(const e of this.cellRecords){if(!e.valid)continue;const t=()=>this.handleCellFocus(e),s=a=>this.handleCellPointer(a,e);e.element.addEventListener("focus",t),e.element.addEventListener("click",s),this.cellListeners.set(e.element,{focus:t,click:s})}}getVisibleRowIds(e){const t=new Set,s=this.rowRecords.filter(r=>r.parentId==null),a=r=>{const o=this.rowById.get(r);if(o&&(t.add(r),!!e.has(r)))for(const n of o.children)a(n)};for(const r of s)a(r.id);return t}syncElementsFromModel(){if(!this.model)return;const e=this.getVisibleRowIds(this.model.state.expandedRowIds()),t=String(this.model.state.columnCount());for(const s of this.rowRecords){const a=this.model.contracts.getRowProps(s.id);s.element.style.setProperty("--cv-treegrid-column-count",t),s.element.id=a.id,s.element.setAttribute("role",a.role),s.element.setAttribute("aria-level",String(a["aria-level"])),s.element.setAttribute("aria-posinset",String(a["aria-posinset"])),s.element.setAttribute("aria-setsize",String(a["aria-setsize"])),s.element.setAttribute("aria-rowindex",String(a["aria-rowindex"])),s.element.setAttribute("aria-selected",a["aria-selected"]),s.element.setAttribute("tabindex","-1"),a["aria-expanded"]?s.element.setAttribute("aria-expanded",a["aria-expanded"]):s.element.removeAttribute("aria-expanded"),a["aria-disabled"]?s.element.setAttribute("aria-disabled",a["aria-disabled"]):s.element.removeAttribute("aria-disabled"),s.element.active=this.model.state.activeCellId()?.rowId===s.id,s.element.selected=a["aria-selected"]==="true",s.element.disabled=a["aria-disabled"]==="true",s.element.expanded=a["aria-expanded"]==="true",s.element.branch=s.children.length>0,s.element.hidden=!e.has(s.id),s.element.level=Number(a["aria-level"]),s.element.expanded||(s.element.expanded=!1)}for(const s of this.cellRecords){if(!s.valid||!e.has(s.rowId)){s.element.hidden=!0;continue}try{const a=this.model.contracts.getCellProps(s.rowId,s.colId);s.element.id=a.id,s.element.setAttribute("role",a.role),s.element.setAttribute("tabindex",a.tabindex),s.element.setAttribute("aria-colindex",String(a["aria-colindex"])),s.element.setAttribute("aria-selected",a["aria-selected"]),a["aria-disabled"]?s.element.setAttribute("aria-disabled",a["aria-disabled"]):s.element.removeAttribute("aria-disabled"),s.element.active=a["data-active"]==="true",s.element.selected=a["aria-selected"]==="true",s.element.disabled=a["aria-disabled"]==="true",s.element.hidden=!1}catch{s.element.hidden=!0}}}syncControlledValuesFromModel(){this.value=this.cellIdToString(this.model.state.activeCellId()),this.selectedValues=[...this.model.state.selectedRowIds()],this.expandedValues=[...this.model.state.expandedRowIds()]}getEventDetail(){return{value:this.value.trim()||null,activeCell:this.model.state.activeCellId(),selectedValues:[...this.model.state.selectedRowIds()],expandedValues:[...this.model.state.expandedRowIds()]}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}applyInteractionResult(e){if(!this.model)return;this.syncElementsFromModel();const t=this.captureSnapshot();this.syncControlledValuesFromModel();const s=!Wi(e.activeCellId,t.activeCellId),a=!Lt(e.selectedRowIds,t.selectedRowIds),r=!Lt(e.expandedRowIds,t.expandedRowIds);if(!(!s&&!a&&!r)){if(!this._programmaticChange){const o=this.getEventDetail();this.dispatchInput(o),(a||r)&&this.dispatchChange(o)}s&&this.focusActiveCell()}}setActiveCell(e){try{this.model.contracts.getCellProps(e.rowId,e.colId).onFocus()}catch{}}focusActiveCell(){const e=this.model.state.activeCellId();if(!e)return;const t=this.cellRecords.find(s=>!(s.rowId!==e.rowId||s.colId!==e.colId||!s.valid));!t||t.element.disabled||t.element.focus()}selectRowFromActive(e){const t=this.model.state.activeCellId();if(!t)return;const s=t.rowId;if(this.selectionMode==="multiple"&&e){this.model.actions.toggleRowSelection(s);return}this.model.actions.selectRow(s)}setSelectedRows(e){const t=this.normalizeRowIds(e),s=new Set(t);if(this.selectionMode==="single"){const r=s.values().next().value;r?this.model.actions.selectRow(r):this.model.state.selectedRowIds.set(new Set);return}const a=new Set(this.model.state.selectedRowIds());for(const r of a)s.has(r)||this.model.actions.toggleRowSelection(r);for(const r of s)a.has(r)||this.model.actions.toggleRowSelection(r)}setExpandedRows(e){const t=new Set(this.normalizeExpandedValues(e)),s=new Set(this.model.state.expandedRowIds());for(const a of s)t.has(a)||this.model.actions.collapseRow(a);for(const a of t)s.has(a)||this.model.actions.expandRow(a)}handleCellFocus=e=>{if(e.element.disabled)return;const t=this.captureSnapshot();this.model.contracts.getCellProps(e.rowId,e.colId).onFocus(),this.applyInteractionResult(t)};handleCellPointer=(e,t)=>{if(t.element.disabled)return;const s=this.captureSnapshot();this.setActiveCellFromRecord(t);const a=this.selectionMode==="multiple";this.selectRowFromActive(a),this.applyInteractionResult(s),this.focusActiveCell()};setActiveCellFromRecord(e){this.setActiveCell({rowId:e.rowId,colId:e.colId})}handleTreegridKeyDown(e){if(!Ac.has(e.key))return;e.preventDefault();const t=this.captureSnapshot();if(e.key==="Enter"||e.key===" "||e.key==="Spacebar"){this.selectRowFromActive(e.ctrlKey||e.metaKey),this.applyInteractionResult(t);return}this.model.actions.handleKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(t)}handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}render(){const e=this.model.contracts.getTreegridProps();return q`
      <div
        part="base"
        role=${e.role}
        tabindex=${e.tabindex}
        aria-label=${e["aria-label"]??y}
        aria-labelledby=${e["aria-labelledby"]??y}
        aria-rowcount=${String(e["aria-rowcount"])}
        aria-colcount=${String(e["aria-colcount"])}
        aria-multiselectable=${e["aria-multiselectable"]}
        @keydown=${this.handleTreegridKeyDown}
        @cv-treegrid-row-slotchange=${this.handleSlotChange}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `}}class Ha extends ve{static elementName="cv-treeitem";static get properties(){return{value:{type:String,reflect:!0},label:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0},selected:{type:Boolean,reflect:!0},expanded:{type:Boolean,reflect:!0},branch:{type:Boolean,reflect:!0},level:{type:Number,reflect:!0}}}constructor(){super(),this.value="",this.label="",this.disabled=!1,this.active=!1,this.selected=!1,this.expanded=!1,this.branch=!1,this.level=1}static styles=[Q`
      :host {
        display: block;
        outline: none;
        --cv-treeview-indent-size: 1.5rem;
        --cv-treeview-indent-guide-width: 0px;
        --cv-treeview-indent-guide-color: var(--cv-color-border, #2a3245);
        --cv-treeview-indent-guide-style: solid;
      }

      :host([hidden]) {
        display: none;
      }

      [part='row'] {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: var(--cv-space-1, 4px);
        min-block-size: 32px;
        padding-inline-start: calc(var(--cv-treeview-indent-size) * max(var(--cv-tree-level, 1) - 1, 0));
        padding-inline-end: var(--cv-space-2, 8px);
        border-radius: var(--cv-radius-sm, 6px);
      }

      :host([active]) [part='row'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, transparent);
      }

      :host([selected]) [part='row'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 30%, transparent);
      }

      :host([disabled]) [part='row'] {
        opacity: 0.55;
      }

      :host(:focus-visible) [part='row'] {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='toggle'] {
        inline-size: 22px;
        block-size: 22px;
        border-radius: var(--cv-radius-xs, 4px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        font-size: 11px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      [part='toggle'][hidden] {
        visibility: hidden;
      }

      [part='children'] {
        display: block;
        position: relative;
        padding-inline-start: var(--cv-treeview-indent-size);
      }

      [part='children']::before {
        content: '';
        position: absolute;
        inset-block: 0;
        inset-inline-start: calc(var(--cv-treeview-indent-size) / 2);
        inline-size: var(--cv-treeview-indent-guide-width);
        border-inline-start: var(--cv-treeview-indent-guide-width) var(--cv-treeview-indent-guide-style) var(--cv-treeview-indent-guide-color);
      }

      [part='children'][hidden] {
        display: none;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}handleToggleClick(e){e.preventDefault(),e.stopPropagation(),this.dispatchEvent(new CustomEvent("cv-treeitem-toggle",{detail:{id:this.value},bubbles:!0,composed:!0}))}render(){return this.style.setProperty("--cv-tree-level",String(this.level)),q`
      <div part="row">
        <button
          type="button"
          aria-hidden=${this.branch?"false":"true"}
          ?hidden=${!this.branch}
          part="toggle"
          @click=${this.handleToggleClick}
        >
          ${this.expanded?"▾":"▸"}
        </button>
        <span part="label"><slot name="label">${this.label}</slot></span>
      </div>

      <div role="group" ?hidden=${!this.expanded} part="children">
        <slot name="children"></slot>
      </div>
    `}}const Oc=new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End","Enter"," ","Spacebar"]),Xi=(i,e)=>i.length===e.length&&i.every((t,s)=>t===e[s]);let Mc=0;class Rc extends de{static elementName="cv-treeview";static get properties(){return{value:{type:String,reflect:!0},values:{attribute:!1},expandedValues:{attribute:!1},selectionMode:{type:String,attribute:"selection-mode",reflect:!0},ariaLabel:{type:String,attribute:"aria-label"}}}idBase=`cv-treeview-${++Mc}`;itemRecords=[];itemListeners=new WeakMap;model;constructor(){super(),this.value="",this.values=[],this.expandedValues=[],this.selectionMode="single",this.ariaLabel="",this.model=mi({idBase:this.idBase,nodes:[]})}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.rebuildModelFromSlot(!1,!1)}disconnectedCallback(){super.disconnectedCallback(),this.detachItemListeners()}willUpdate(e){if(super.willUpdate(e),e.has("selectionMode")||e.has("ariaLabel")){this.rebuildModelFromSlot(!0,!1);return}if(e.has("value")&&this.selectionMode==="single"){const t=this.value.trim();this.value!==t&&(this.value=t),t.length===0?this.model.actions.clearSelected():this.model.actions.select(t),this.applyProgrammaticChange()}e.has("values")&&this.selectionMode==="multiple"&&(this.setSelectedIdsInModel(this.values),this.applyProgrammaticChange()),e.has("expandedValues")&&(this.setExpandedIdsInModel(this.expandedValues),this.applyProgrammaticChange())}updated(e){super.updated(e),!e.has("value")&&!e.has("values")&&!e.has("expandedValues")&&this.syncItemElements()}getDirectChildTreeItems(e){return Array.from(e.children??[]).filter(t=>t.tagName.toLowerCase()===Ha.elementName)}ensureItemValue(e,t){const s=e.value?.trim();if(s)return s;const a=`item-${t+1}`;return e.value=a,a}parseTreeNodes(e,t,s){return this.getDirectChildTreeItems(e).map((r,o)=>{const n=this.ensureItemValue(r,o),l=this.parseTreeNodes(r,n,s+1);return this.itemRecords.push({id:n,parentId:t,branch:l.length>0,element:r}),t!=null?r.slot="children":r.slot="",{id:n,label:r.label||r.textContent?.trim()||n,disabled:r.disabled,children:l}})}rebuildModelFromSlot(e,t=!0){const s=e?this.captureSnapshot():null;this.detachItemListeners(),this.itemRecords=[];const a=this.parseTreeNodes(this,null,1),r=new Set(this.itemRecords.map(u=>u.id)),o=(s?.expandedIds??this.expandedValues).filter(u=>r.has(u)),n=this.selectionMode==="multiple"?(s?.selectedIds??this.values).filter(u=>r.has(u)):[s?.selectedIds[0]??this.value].filter(u=>typeof u=="string"&&r.has(u)),l=s?.activeId??n[0]??null,d=l&&r.has(l)?l:null;this.model=mi({idBase:this.idBase,nodes:a,selectionMode:this.selectionMode,ariaLabel:this.ariaLabel||void 0,initialExpandedIds:o,initialSelectedIds:n,initialActiveId:d}),this.attachItemListeners(),this.syncItemElements(),this.syncControlledValuesFromModel(),t&&this.requestUpdate()}detachItemListeners(){for(const e of this.itemRecords){const t=this.itemListeners.get(e.element);t&&(e.element.removeEventListener("click",t.click),e.element.removeEventListener("focus",t.focus),e.element.removeEventListener("cv-treeitem-toggle",t.toggle),this.itemListeners.delete(e.element))}}attachItemListeners(){for(const e of this.itemRecords){const t=()=>{this.handleItemClick(e.id)},s=()=>{this.handleItemFocus(e.id)},a=r=>{r.stopPropagation(),this.handleItemToggle(e.id)};e.element.addEventListener("click",t),e.element.addEventListener("focus",s),e.element.addEventListener("cv-treeitem-toggle",a),this.itemListeners.set(e.element,{click:t,focus:s,toggle:a})}}syncItemElements(){const e=new Set(this.model.contracts.getVisibleNodeIds());for(const t of this.itemRecords){const s=this.model.contracts.getItemProps(t.id);t.element.id=s.id,t.element.setAttribute("role",s.role),t.element.setAttribute("tabindex",s.tabindex),t.element.setAttribute("aria-level",String(s["aria-level"])),t.element.setAttribute("aria-posinset",String(s["aria-posinset"])),t.element.setAttribute("aria-setsize",String(s["aria-setsize"])),t.element.setAttribute("aria-selected",s["aria-selected"]),t.element.setAttribute("data-active",s["data-active"]),s["aria-expanded"]?t.element.setAttribute("aria-expanded",s["aria-expanded"]):t.element.removeAttribute("aria-expanded"),s["aria-disabled"]?t.element.setAttribute("aria-disabled",s["aria-disabled"]):t.element.removeAttribute("aria-disabled"),s["data-expanded"]?t.element.setAttribute("data-expanded",s["data-expanded"]):t.element.removeAttribute("data-expanded"),t.element.active=s["data-active"]==="true",t.element.selected=s["aria-selected"]==="true",t.element.expanded=s["aria-expanded"]==="true",t.element.branch=t.branch,t.element.level=s["aria-level"],t.element.disabled=s["aria-disabled"]==="true",t.element.hidden=!e.has(t.id)}}syncControlledValuesFromModel(){const e=[...this.model.state.selectedIds()],t=[...this.model.state.expandedIds()];this.values=e,this.value=e[0]??"",this.expandedValues=t}setSelectedIdsInModel(e){const t=[...new Set(e.map(a=>a.trim()).filter(a=>a.length>0))];if(this.selectionMode==="single"){const a=t[0];if(!a){this.model.actions.clearSelected();return}this.model.actions.select(a);return}const s=this.model.state.activeId();this.model.actions.clearSelected();for(const a of t)this.model.actions.toggleSelected(a);s&&this.model.actions.setActive(s)}setExpandedIdsInModel(e){const t=new Set(e.map(a=>a.trim()).filter(a=>a.length>0)),s=this.model.state.expandedIds();for(const a of s)t.has(a)||this.model.actions.collapse(a);for(const a of t)s.includes(a)||this.model.actions.expand(a)}captureSnapshot(){return{selectedIds:[...this.model.state.selectedIds()],activeId:this.model.state.activeId(),expandedIds:[...this.model.state.expandedIds()]}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}focusActiveItem(){const e=this.model.state.activeId();if(!e)return;this.itemRecords.find(s=>s.id===e)?.element.focus()}applyProgrammaticChange(){this.syncItemElements(),this.syncControlledValuesFromModel()}applyInteractionResult(e){this.syncItemElements();const t=this.captureSnapshot();this.syncControlledValuesFromModel();const s=!Xi(e.selectedIds,t.selectedIds),a=e.activeId!==t.activeId,r=!Xi(e.expandedIds,t.expandedIds);if(!s&&!a&&!r)return;const o={value:this.value||null,values:[...this.values],activeId:t.activeId,expandedValues:[...this.expandedValues]};this.dispatchInput(o),(s||r)&&this.dispatchChange(o),a&&this.focusActiveItem()}handleItemClick(e){const t=this.captureSnapshot();this.model.actions.setActive(e),this.selectionMode==="multiple"?this.model.actions.toggleSelected(e):this.model.actions.select(e),this.applyInteractionResult(t)}handleItemFocus(e){const t=this.captureSnapshot();this.model.actions.setActive(e),this.applyInteractionResult(t)}handleItemToggle(e){const t=this.captureSnapshot();this.model.actions.toggleExpanded(e),this.applyInteractionResult(t)}handleTreeKeyDown(e){Oc.has(e.key)&&e.preventDefault();const t=this.captureSnapshot();this.model.actions.handleKeyDown({key:e.key,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}),this.applyInteractionResult(t)}handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}render(){const e=this.model.contracts.getTreeProps();return q`
      <div
        role=${e.role}
        tabindex=${e.tabindex}
        aria-label=${e["aria-label"]??y}
        aria-multiselectable=${e["aria-multiselectable"]??y}
        part="base"
        @keydown=${this.handleTreeKeyDown}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `}}class $s extends ve{static elementName="cv-toolbar-item";static get properties(){return{value:{type:String,reflect:!0},disabled:{type:Boolean,reflect:!0},active:{type:Boolean,reflect:!0}}}constructor(){super(),this.value="",this.disabled=!1,this.active=!1}static styles=[Q`
      :host {
        display: inline-block;
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      .item {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: var(--cv-toolbar-item-min-height, 32px);
        padding: 0 var(--cv-toolbar-item-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-toolbar-item-border-radius, var(--cv-radius-sm, 6px));
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        transition:
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([active]) .item {
        border-color: var(--cv-color-primary, #65d7ff);
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, var(--cv-color-surface, #141923));
      }

      :host([disabled]) .item {
        opacity: 0.55;
      }

      :host(:focus-visible) .item {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<div class="item" part="base"><slot></slot></div>`}}class cs extends ve{static elementName="cv-toolbar-separator";static get properties(){return{value:{type:String,reflect:!0},separatorRole:{type:String,attribute:!1},separatorOrientation:{type:String,attribute:!1}}}constructor(){super(),this.value="",this.separatorRole="separator",this.separatorOrientation="vertical"}static styles=[Q`
      :host {
        display: block;
        pointer-events: none;
      }

      [part='base'] {
        background: var(--cv-toolbar-separator-color, var(--cv-color-border, #2a3245));
        margin: var(--cv-toolbar-separator-margin, var(--cv-space-1, 4px));
        width: var(--cv-toolbar-separator-size, 1px);
        align-self: stretch;
      }

      [part='base'][aria-orientation='horizontal'] {
        width: auto;
        height: var(--cv-toolbar-separator-size, 1px);
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}render(){return q`<div part="base" role=${this.separatorRole} aria-orientation=${this.separatorOrientation}></div>`}}const Tc=new Set(["ArrowRight","ArrowLeft","ArrowDown","ArrowUp","Home","End"]);let Bc=0;class Pc extends de{static elementName="cv-toolbar";static get properties(){return{value:{type:String,reflect:!0},orientation:{type:String,reflect:!0},wrap:{type:Boolean,reflect:!0},ariaLabel:{type:String,attribute:"aria-label"}}}idBase=`cv-toolbar-${++Bc}`;itemRecords=[];separatorRecords=[];itemListeners=new WeakMap;hasFocus=!1;model;constructor(){super(),this.value="",this.orientation="horizontal",this.wrap=!0,this.ariaLabel="",this.model=Si({idBase:this.idBase,items:[],orientation:this.orientation,wrap:this.wrap,ariaLabel:void 0,initialActiveId:null})}static styles=[Q`
      :host {
        display: block;
      }

      [part='base'] {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--cv-toolbar-gap, var(--cv-space-1, 4px));
        padding: var(--cv-toolbar-padding, var(--cv-space-1, 4px));
        border-radius: var(--cv-toolbar-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      :host([orientation='vertical']) [part='base'] {
        flex-direction: column;
        align-items: stretch;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this),cs.define()}connectedCallback(){super.connectedCallback(),this.rebuildModelFromSlot(!1,!1)}disconnectedCallback(){super.disconnectedCallback(),this.detachItemListeners()}willUpdate(e){if(super.willUpdate(e),e.has("orientation")||e.has("wrap")||e.has("ariaLabel")){this.rebuildModelFromSlot(!0,!1);return}if(e.has("value")){const t=this.value.trim();if(t&&this.model.state.activeId()!==t){const s=this.model.state.activeId();this.model.actions.setActive(t),this.applyInteractionResult(s)}}}updated(e){super.updated(e),e.has("value")||(this.syncItemElements(),this.syncSeparatorElements())}getItemElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===$s.elementName)}getSeparatorElements(){return Array.from(this.children).filter(e=>e.tagName.toLowerCase()===cs.elementName)}ensureItemValue(e,t){const s=e.value?.trim();if(s)return s;const a=`item-${t+1}`;return e.value=a,a}ensureSeparatorValue(e,t){const s=e.value?.trim();if(s)return s;const a=`sep-${t+1}`;return e.value=a,a}rebuildModelFromSlot(e,t=!0){const s=this.getItemElements(),a=this.getSeparatorElements(),r=e?this.model.state.activeId():this.value.trim()||null;this.detachItemListeners(),this.itemRecords=s.map((n,l)=>({id:this.ensureItemValue(n,l),disabled:n.disabled,element:n})),this.separatorRecords=a.map((n,l)=>({id:this.ensureSeparatorValue(n,l),element:n}));const o=[];for(const n of Array.from(this.children)){const l=n.tagName.toLowerCase();if(l===$s.elementName){const d=this.itemRecords.find(u=>u.element===n);d&&o.push({id:d.id,disabled:d.disabled})}else if(l===cs.elementName){const d=this.separatorRecords.find(u=>u.element===n);d&&o.push({id:d.id,separator:!0})}}this.model=Si({idBase:this.idBase,items:o,orientation:this.orientation,wrap:this.wrap,ariaLabel:this.ariaLabel||void 0,initialActiveId:r}),this.attachItemListeners(),this.syncItemElements(),this.syncSeparatorElements(),this.value=this.model.state.activeId()??"",t&&this.requestUpdate()}detachItemListeners(){for(const e of this.itemRecords){const t=this.itemListeners.get(e.element);t&&(e.element.removeEventListener("focus",t.focus),e.element.removeEventListener("click",t.click),this.itemListeners.delete(e.element))}}attachItemListeners(){for(const e of this.itemRecords){const t=()=>{this.handleItemFocus(e.id)},s=()=>{this.handleItemFocus(e.id)};e.element.addEventListener("focus",t),e.element.addEventListener("click",s),this.itemListeners.set(e.element,{focus:t,click:s})}}syncItemElements(){for(const e of this.itemRecords){const t=this.model.contracts.getItemProps(e.id);e.element.id=t.id,e.element.tabIndex=Number(t.tabindex),t["aria-disabled"]?e.element.setAttribute("aria-disabled",t["aria-disabled"]):e.element.removeAttribute("aria-disabled"),e.element.setAttribute("data-active",t["data-active"]),e.element.active=t["data-active"]==="true",e.element.disabled=t["aria-disabled"]==="true"}}syncSeparatorElements(){for(const e of this.separatorRecords){const t=this.model.contracts.getSeparatorProps(e.id);e.element.id=t.id,e.element.separatorRole=t.role,e.element.separatorOrientation=t["aria-orientation"]}}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}focusActiveItem(){const e=this.model.state.activeId();if(!e)return;this.itemRecords.find(s=>s.id===e)?.element.focus()}applyInteractionResult(e){this.syncItemElements();const t=this.model.state.activeId();if(this.value=t??"",t===e)return;const s={activeId:t};this.dispatchInput(s),this.dispatchChange(s),this.focusActiveItem()}handleItemFocus(e){const t=this.model.state.activeId();this.model.actions.setActive(e),this.applyInteractionResult(t)}handleToolbarKeyDown(e){Tc.has(e.key)&&e.preventDefault();const t=this.model.state.activeId();this.model.actions.handleKeyDown({key:e.key}),this.applyInteractionResult(t)}handleSlotChange(){this.rebuildModelFromSlot(!0,!0)}handleFocusIn(){this.hasFocus||(this.hasFocus=!0,this.model.actions.handleToolbarFocus(),this.syncItemElements(),this.value=this.model.state.activeId()??"")}handleFocusOut(e){const t=e.relatedTarget;(!t||!this.contains(t))&&(this.hasFocus=!1,this.model.actions.handleToolbarBlur())}render(){const e=this.model.contracts.getRootProps();return q`
      <div
        id=${e.id}
        role=${e.role}
        aria-orientation=${e["aria-orientation"]}
        aria-label=${e["aria-label"]??y}
        part="base"
        @keydown=${this.handleToolbarKeyDown}
        @focusin=${this.handleFocusIn}
        @focusout=${this.handleFocusOut}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `}}const lt=typeof HTMLElement<"u"&&typeof HTMLElement.prototype.showPopover=="function"&&typeof HTMLElement.prototype.hidePopover=="function",Fc=typeof CSS<"u"&&typeof CSS.supports=="function"&&CSS.supports("anchor-name: --cv-tooltip-anchor")&&CSS.supports("position-anchor: --cv-tooltip-anchor")&&CSS.supports("position-area: top")&&CSS.supports("top: anchor(bottom)"),Nc=typeof CSS<"u"&&typeof CSS.supports=="function"&&CSS.supports("position-try-fallbacks: flip-block"),ds=lt&&Fc&&Nc;let Vc=0;class zc extends de{static elementName="cv-tooltip";static get properties(){return{open:{type:Boolean,reflect:!0},disabled:{type:Boolean,reflect:!0},showDelay:{type:Number,attribute:"show-delay",reflect:!0},hideDelay:{type:Number,attribute:"hide-delay",reflect:!0},trigger:{type:String,reflect:!0},arrow:{type:Boolean,reflect:!0}}}idBase=`cv-tooltip-${++Vc}`;model;triggerTargets=new Set;lastEmittedOpen=!1;hasLayoutListeners=!1;layoutFrame=-1;constructor(){super(),this.open=!1,this.disabled=!1,this.showDelay=120,this.hideDelay=80,this.trigger="hover focus",this.arrow=!1,this.model=this.createModel(),this.lastEmittedOpen=this.model.state.isOpen()}static styles=[Q`
      :host {
        display: inline-block;
      }

      [part='base'] {
        position: relative;
        display: inline-block;
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        anchor-name: --cv-tooltip-anchor;
      }

      [part='content'] {
        position: absolute;
        inset-inline-start: 50%;
        inset-block-end: calc(100% + var(--cv-space-1, 4px));
        transform: translateX(-50%);
        z-index: 30;
        max-inline-size: min(320px, calc(100vw - 32px));
        padding: var(--cv-space-1, 4px) var(--cv-space-2, 8px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
        font-size: 0.85rem;
        white-space: nowrap;
        box-shadow: var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24));
      }

      [part='content'][data-anchor-positioning='true'] {
        position: fixed;
        inset: auto;
        margin: 0;
        position-anchor: --cv-tooltip-anchor;
        position-area: top;
        position-try-fallbacks: flip-block, flip-inline, bottom, right, left;
        position-visibility: anchors-visible;
        transform: none;
        translate: none;
      }

      [part='content'][hidden] {
        display: none;
      }

      [part='arrow'] {
        position: absolute;
        inset-inline-start: 50%;
        inset-block-start: 100%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-inline: 6px solid transparent;
        border-block-start: 6px solid var(--cv-color-surface-elevated, #1d2432);
      }

      [part='content'][data-placement='bottom'] [part='arrow'] {
        inset-block-start: auto;
        inset-block-end: 100%;
        border-block-start: none;
        border-block-end: 6px solid var(--cv-color-surface-elevated, #1d2432);
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.syncTriggerAria()}disconnectedCallback(){if(super.disconnectedCallback(),this.toggleLayoutListeners(!1),this.cancelLayoutFrame(),lt){const e=this.getContentElement();e?.matches(":popover-open")&&e.hidePopover()}}willUpdate(e){if(super.willUpdate(e),e.has("showDelay")||e.has("hideDelay")||e.has("trigger")){const t=this.model.state.isOpen()||this.open;this.model=this.createModel(t);return}if(e.has("disabled")&&this.model.actions.setDisabled(this.disabled),e.has("open")&&this.model.state.isOpen()!==this.open){const t=this.model.state.isOpen();this.open?this.model.actions.open():this.model.actions.close(),this.applyInteractionResult(t)}}updated(e){super.updated(e),this.syncTriggerAria();const t=this.model.state.isOpen();this.open!==t&&(this.open=t),this.lastEmittedOpen!==t&&this.emitOpenChange(t),this.syncNativePopover();const s=t&&!ds;if(this.toggleLayoutListeners(s),t)this.scheduleLayout();else{this.cancelLayoutFrame();const a=this.getContentElement();a&&(this.clearInlineLayout(a),a.dataset.placement="top")}}getContentElement(){return this.shadowRoot?.querySelector('[part="content"]')}getTriggerElement(){return this.shadowRoot?.querySelector('[part="trigger"]')}clearInlineLayout(e){e.style.position="",e.style.top="",e.style.left="",e.style.bottom="",e.style.insetInlineStart="",e.style.insetBlockEnd="",e.style.transform="",e.style.translate=""}syncNativePopover(){if(!lt)return;const e=this.getContentElement();if(!e)return;const t=this.model.state.isOpen(),s=e.matches(":popover-open");if(t&&!s){e.showPopover();return}!t&&s&&e.hidePopover()}applyFallbackLayout(e,t){const s=t.getBoundingClientRect(),a=e.getBoundingClientRect(),r=window.innerWidth,o=window.innerHeight,n=6,l=8,d=s.top,u=o-s.bottom,h=d>=a.height+n||d>=u&&d>=a.height/2;let p=h?s.top-a.height-n:s.bottom+n,v=s.left+s.width/2-a.width/2;const g=Math.max(l,r-a.width-l),f=Math.max(l,o-a.height-l);v=Math.min(Math.max(v,l),g),p=Math.min(Math.max(p,l),f),e.dataset.placement=h?"top":"bottom",e.style.position="fixed",e.style.top=`${p}px`,e.style.left=`${v}px`,e.style.bottom="auto",e.style.insetInlineStart="auto",e.style.insetBlockEnd="auto",e.style.transform="none",e.style.translate="none"}syncTooltipLayout(){const e=this.getContentElement(),t=this.getTriggerElement();if(!(!e||!t)){if(ds){this.clearInlineLayout(e),e.dataset.placement="top";return}this.applyFallbackLayout(e,t)}}cancelLayoutFrame(){this.layoutFrame!==-1&&(cancelAnimationFrame(this.layoutFrame),this.layoutFrame=-1)}scheduleLayout(){this.cancelLayoutFrame(),this.layoutFrame=requestAnimationFrame(()=>{this.layoutFrame=-1,this.syncTooltipLayout()})}toggleLayoutListeners(e){if(this.hasLayoutListeners!==e){if(this.hasLayoutListeners=e,e){window.addEventListener("resize",this.handleViewportChange),window.addEventListener("scroll",this.handleViewportChange,!0);return}window.removeEventListener("resize",this.handleViewportChange),window.removeEventListener("scroll",this.handleViewportChange,!0)}}handleViewportChange=()=>{this.model.state.isOpen()&&this.scheduleLayout()};createModel(e=this.open){return Ko({idBase:this.idBase,initialOpen:e,isDisabled:this.disabled,showDelay:this.showDelay,hideDelay:this.hideDelay,trigger:this.trigger})}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}emitOpenChange(e){this.lastEmittedOpen=e;const t={open:e};this.dispatchInput(t),this.dispatchChange(t)}applyInteractionResult(e){const t=this.model.state.isOpen();this.open=t,this.disabled=this.model.state.isDisabled(),this.syncTriggerAria(),e!==t&&this.emitOpenChange(t)}syncTriggerAria(){const t=this.model.contracts.getTriggerProps()["aria-describedby"],a=(this.shadowRoot?.querySelector('slot[name="trigger"]')?.assignedElements({flatten:!0})??[]).filter(o=>o instanceof HTMLElement);for(const o of this.triggerTargets)a.includes(o)||o.removeAttribute("aria-describedby");this.triggerTargets=new Set(a);for(const o of a)t?o.setAttribute("aria-describedby",t):o.removeAttribute("aria-describedby");const r=this.shadowRoot?.querySelector('[part="trigger"]');r&&(t?r.setAttribute("aria-describedby",t):r.removeAttribute("aria-describedby"))}handlePointerEnter(){const e=this.model.contracts.getTriggerProps();if(!e.onPointerEnter)return;const t=this.model.state.isOpen();e.onPointerEnter(),this.applyInteractionResult(t)}handlePointerLeave(){const e=this.model.contracts.getTriggerProps();if(!e.onPointerLeave)return;const t=this.model.state.isOpen();e.onPointerLeave(),this.applyInteractionResult(t)}handleFocusIn(){const e=this.model.contracts.getTriggerProps();if(!e.onFocus)return;const t=this.model.state.isOpen();e.onFocus(),this.applyInteractionResult(t)}handleFocusOut(){const e=this.model.contracts.getTriggerProps();if(!e.onBlur)return;const t=this.model.state.isOpen();e.onBlur(),this.applyInteractionResult(t)}handleClick(){const e=this.model.contracts.getTriggerProps();if(!e.onClick)return;const t=this.model.state.isOpen();e.onClick(),this.applyInteractionResult(t)}handleKeyDown(e){const t=this.model.state.isOpen();this.model.contracts.getTriggerProps().onKeyDown({key:e.key}),this.applyInteractionResult(t)}handleTriggerSlotChange(){this.syncTriggerAria()}show(){const e=this.model.state.isOpen();this.model.actions.show(),this.applyInteractionResult(e)}hide(){const e=this.model.state.isOpen();this.model.actions.hide(),this.applyInteractionResult(e)}render(){const e=this.model.contracts.getTriggerProps(),t=this.model.contracts.getTooltipProps();return q`
      <span part="base">
        <span
          id=${e.id}
          part="trigger"
          @pointerenter=${this.handlePointerEnter}
          @pointerleave=${this.handlePointerLeave}
          @focusin=${this.handleFocusIn}
          @focusout=${this.handleFocusOut}
          @click=${this.handleClick}
          @keydown=${this.handleKeyDown}
        >
          <slot name="trigger" @slotchange=${this.handleTriggerSlotChange}>?</slot>
        </span>

        <span
          id=${t.id}
          role=${t.role}
          tabindex=${t.tabindex}
          popover=${lt?"manual":y}
          data-placement="top"
          data-anchor-positioning=${ds?"true":"false"}
          ?hidden=${lt?!1:t.hidden}
          part="content"
        >
          <slot name="content"></slot>
          ${this.arrow?q`<span part="arrow"></span>`:""}
        </span>
      </span>
    `}}const Kc=new Set(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","Enter"]);let _c=0;class Uc extends de{static elementName="cv-window-splitter";static get properties(){return{position:{type:Number,reflect:!0},min:{type:Number,reflect:!0},max:{type:Number,reflect:!0},step:{type:Number,reflect:!0},orientation:{type:String,reflect:!0},fixed:{type:Boolean,reflect:!0},snap:{type:String},snapThreshold:{type:Number,attribute:"snap-threshold"},ariaLabel:{type:String,attribute:"aria-label"},ariaLabelledBy:{type:String,attribute:"aria-labelledby"}}}idBase=`cv-window-splitter-${++_c}`;model;_dragStartPosition=0;constructor(){super(),this.position=50,this.min=0,this.max=100,this.step=1,this.orientation="vertical",this.fixed=!1,this.snap=void 0,this.snapThreshold=12,this.ariaLabel="",this.ariaLabelledBy="",this.model=this.createModel()}static styles=[Q`
      :host {
        display: block;
        inline-size: 100%;
        min-block-size: 140px;
      }

      [part='base'] {
        inline-size: 100%;
        block-size: 100%;
        display: grid;
        gap: 0;
      }

      [part='base'][data-orientation='vertical'] {
        grid-template-columns: var(--cv-window-splitter-primary-size, 50%) var(--cv-window-splitter-divider-size, 8px) 1fr;
      }

      [part='base'][data-orientation='horizontal'] {
        grid-template-rows: var(--cv-window-splitter-primary-size, 50%) var(--cv-window-splitter-divider-size, 8px) 1fr;
      }

      [part='pane'] {
        min-inline-size: 0;
        min-block-size: 0;
        overflow: auto;
      }

      [part='pane'][data-pane='primary'] {
        border-inline-end: 1px solid transparent;
      }

      [part='separator'] {
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in oklab, var(--cv-color-surface, #141923) 82%, black);
        border: 1px solid var(--cv-color-border, #2a3245);
        color: var(--cv-color-text-muted, #9aa6bf);
        user-select: none;
        touch-action: none;
      }

      [part='separator']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='separator'][data-orientation='vertical'] {
        cursor: col-resize;
      }

      [part='separator'][data-orientation='horizontal'] {
        cursor: row-resize;
      }

      [part='separator-handle'] {
        opacity: 0.8;
        font-size: 11px;
        line-height: 1;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}disconnectedCallback(){super.disconnectedCallback()}willUpdate(e){if(super.willUpdate(e),e.has("min")||e.has("max")||e.has("step")||e.has("orientation")||e.has("fixed")||e.has("snap")||e.has("snapThreshold")||e.has("ariaLabel")||e.has("ariaLabelledBy")){this.model=this.createModel();return}e.has("position")&&this.model.state.position()!==this.position&&this.model.actions.setPosition(this.position)}createModel(){return Yo({idBase:this.idBase,min:this.min,max:this.max,position:this.position,step:this.step,orientation:this.orientation,isFixed:this.fixed,snap:this.snap,snapThreshold:this.snapThreshold,ariaLabel:this.ariaLabel||void 0,ariaLabelledBy:this.ariaLabelledBy||void 0})}getPercentage(){const e=this.model.state.min(),t=this.model.state.max();return t<=e?0:Math.max(0,Math.min(100,(this.model.state.position()-e)/(t-e)*100))}dispatchInput(e){this.dispatchEvent(new CustomEvent("cv-input",{detail:e,bubbles:!0,composed:!0}))}dispatchChange(e){this.dispatchEvent(new CustomEvent("cv-change",{detail:e,bubbles:!0,composed:!0}))}syncFromModelAndEmit(e,t){const s=this.model.state.position();if(this.position=s,s===e)return!1;const a={position:s};return this.dispatchInput(a),t&&this.dispatchChange(a),!0}handleSeparatorKeyDown(e){Kc.has(e.key)&&e.preventDefault();const t=this.model.state.position();this.model.actions.handleKeyDown({key:e.key}),this.snap&&this.model.actions.setPosition(this.model.state.position()),this.syncFromModelAndEmit(t,!0)}_onPointerDown=e=>{if(e.button!==void 0&&e.button!==0)return;e.preventDefault();const t=e.currentTarget;t.setPointerCapture(e.pointerId),this.model.actions.startDragging(),this._dragStartPosition=this.position,t.setAttribute("data-dragging",""),t.addEventListener("pointermove",this._onPointerMove),t.addEventListener("pointerup",this._onPointerUp),t.addEventListener("pointercancel",this._onPointerUp),t.addEventListener("lostpointercapture",this._onLostPointerCapture)};_onPointerMove=e=>{const t=this.shadowRoot?.querySelector('[part="base"]');if(!t)return;const s=t.getBoundingClientRect();if(s.width<=0||s.height<=0)return;const a=this.orientation==="vertical"?(e.clientX-s.left)/s.width:(e.clientY-s.top)/s.height,r=Math.max(0,Math.min(1,a)),o=this.model.state.min(),n=this.model.state.max(),l=o+r*(n-o);this.model.actions.setPosition(l);const d=this.model.state.position();this.position=d,this.dispatchEvent(new CustomEvent("cv-input",{detail:{position:d},bubbles:!0,composed:!0}))};_onPointerUp=e=>{const t=e.currentTarget;t.removeEventListener("pointermove",this._onPointerMove),t.removeEventListener("pointerup",this._onPointerUp),t.removeEventListener("pointercancel",this._onPointerUp),t.removeEventListener("lostpointercapture",this._onLostPointerCapture),t.removeAttribute("data-dragging"),this.model.actions.stopDragging();const s=this.model.state.position();s!==this._dragStartPosition&&this.dispatchEvent(new CustomEvent("cv-change",{detail:{position:s},bubbles:!0,composed:!0}))};_onLostPointerCapture=e=>{const t=e.currentTarget;t.removeEventListener("pointermove",this._onPointerMove),t.removeEventListener("pointerup",this._onPointerUp),t.removeEventListener("pointercancel",this._onPointerUp),t.removeEventListener("lostpointercapture",this._onLostPointerCapture),t.removeAttribute("data-dragging"),this.model.actions.stopDragging();const s=this.model.state.position();s!==this._dragStartPosition&&this.dispatchEvent(new CustomEvent("cv-change",{detail:{position:s},bubbles:!0,composed:!0}))};render(){const e=this.model.contracts.getSplitterProps(),t=this.model.contracts.getPrimaryPaneProps(),s=this.model.contracts.getSecondaryPaneProps(),a=this.getPercentage(),r=this.model.state.isDragging();return q`
      <div
        part="base"
        data-orientation=${this.orientation}
        style=${`--cv-window-splitter-primary-size:${a}%;`}
      >
        <div
          id=${t.id}
          data-pane=${t["data-pane"]}
          data-orientation=${t["data-orientation"]}
          part="pane"
        >
          <slot name="primary"></slot>
        </div>

        <div
          id=${e.id}
          role=${e.role}
          tabindex=${e.tabindex}
          aria-valuenow=${e["aria-valuenow"]}
          aria-valuemin=${e["aria-valuemin"]}
          aria-valuemax=${e["aria-valuemax"]}
          aria-valuetext=${e["aria-valuetext"]??y}
          aria-orientation=${e["aria-orientation"]}
          aria-controls=${e["aria-controls"]}
          aria-label=${e["aria-label"]??y}
          aria-labelledby=${e["aria-labelledby"]??y}
          data-orientation=${this.orientation}
          ?data-dragging=${r}
          part="separator"
          @keydown=${this.handleSeparatorKeyDown}
          @pointerdown=${this._onPointerDown}
        >
          <span part="separator-handle">
            <slot name="separator">${this.orientation==="vertical"?"⋮":"⋯"}</slot>
          </span>
        </div>

        <div
          id=${s.id}
          data-pane=${s["data-pane"]}
          data-orientation=${s["data-orientation"]}
          part="pane"
        >
          <slot name="secondary"></slot>
        </div>
      </div>
    `}}const qc=new Map;function Hc(i){return{...i}}function jc(i){const e=qc.get(i);if(e)return{name:e.name,tokens:Hc(e.tokens)}}class Gc extends ve{static elementName="cv-theme-provider";static get properties(){return{theme:{type:String,reflect:!0},mode:{type:String,reflect:!0}}}_mediaQuery=null;_mediaChangeHandler=null;_appliedTokens=new Set;constructor(){super(),this.theme="",this.mode="system"}static styles=[Q`
      :host {
        display: contents;
      }
    `];static define(){customElements.get(this.elementName)||customElements.define(this.elementName,this)}connectedCallback(){super.connectedCallback(),this.style.display="contents",this._applyMode(),this._applyCurrentTheme()}disconnectedCallback(){super.disconnectedCallback(),this._removeMediaListener()}updated(e){super.updated(e),e.has("mode")&&this._applyMode(),e.has("theme")&&this._applyCurrentTheme()}_applyMode(){this.mode==="system"?this._setupMediaListener():(this._removeMediaListener(),this.style.colorScheme=this.mode)}_setupMediaListener(){if(this._removeMediaListener(),typeof window.matchMedia!="function"){this.style.colorScheme="light";return}const e=window.matchMedia("(prefers-color-scheme: dark)");if(!e){this.style.colorScheme="light";return}this._mediaQuery=e,this.style.colorScheme=e.matches?"dark":"light",this._mediaChangeHandler=t=>{this.style.colorScheme=t.matches?"dark":"light"},e.addEventListener("change",this._mediaChangeHandler)}_removeMediaListener(){this._mediaQuery&&this._mediaChangeHandler&&(this._mediaQuery.removeEventListener("change",this._mediaChangeHandler),this._mediaQuery=null,this._mediaChangeHandler=null)}_applyCurrentTheme(){for(const t of this._appliedTokens)this.style.removeProperty(t);if(this._appliedTokens.clear(),!this.theme){this.removeAttribute("data-cv-theme");return}const e=jc(this.theme);if(!e){console.warn(`[cv-theme-provider] Theme "${this.theme}" is not registered.`);return}for(const[t,s]of Object.entries(e.tokens))this.style.setProperty(t,s),this._appliedTokens.add(t);this.setAttribute("data-cv-theme",this.theme)}render(){return q`<slot></slot>`}}function Wc(){Gc.define(),Da.define(),kn.define(),Sn.define(),En.define(),La.define(),Dn.define(),Ln.define(),Rn.define(),Pn.define(),zn.define(),Oa.define(),Bs.define(),Ps.define(),Ma.define(),jn.define(),qe.define(),Yn.define(),Qn.define(),el.define(),sl.define(),al.define(),ol.define(),cl.define(),ll.define(),Ra.define(),Bt.define(),Pt.define(),hl.define(),xl.define(),$l.define(),Ft.define(),Cl.define(),Al.define(),ft.define(),Ol.define(),Tl.define(),Pl.define(),Kl.define(),Ul.define(),Hl.define(),Ta.define(),Wl.define(),ys.define(),Ba.define(),Zl.define(),lc.define(),uc.define(),mc.define(),Pa.define(),fc.define(),Fa.define(),Na.define(),Va.define(),xc.define(),$c.define(),za.define(),Ka.define(),Sc.define(),Ec.define(),Lc.define(),Ua.define(),_a.define(),qa.define(),Ha.define(),Rc.define(),$s.define(),Pc.define(),zc.define(),Uc.define()}yn(gr);Wc();const ja=ws(),Zi=document.querySelector("#toast-region"),Yc=document.querySelector("#toast-trigger"),Fs=document.querySelector("#inline-alert"),Xc=document.querySelector("#alert-success-trigger"),Zc=document.querySelector("#alert-warning-trigger"),Qc=document.querySelector("#alert-hide-trigger"),Jc=document.querySelector("cv-select"),Qi=document.querySelector("cv-meter");Zi&&(Zi.controller=ja);Yc?.addEventListener("click",()=>{ja.push({message:"Toast from demo page",level:"success",durationMs:2200})});Xc?.addEventListener("click",()=>{Fs?.show("Configuration saved successfully")});Zc?.addEventListener("click",()=>{Fs?.show("Please check advanced diagnostics settings")});Qc?.addEventListener("click",()=>{Fs?.hide()});Jc?.addEventListener("cv-change",i=>{const t=i.detail.value??"balanced",s={silent:24,balanced:46,turbo:78,locked:46};if(Qi){const a=s[t]??46;Qi.setAttribute("value",String(a))}});
