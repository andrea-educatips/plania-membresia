const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

async function supabaseReq(method, path, body=null){
  const opts={method,headers:{"Content-Type":"application/json","apikey":SUPABASE_SECRET,"Authorization":`Bearer ${SUPABASE_SECRET}`,"Prefer":method==="POST"?"return=representation":""}};
  if(body)opts.body=JSON.stringify(body);
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,opts);
  return r.ok?r.json():null;
}

async function obtenerUsuario(email){
  const d=await supabaseReq("GET",`creditos?user_email=eq.${encodeURIComponent(email)}&select=*`);
  return d?.[0]||null;
}

async function crearUsuario(email){
  const d=await supabaseReq("POST","creditos",{user_email:email,creditos_disponibles:4,plan:"gratuito"});
  return d?.[0]||null;
}

async function descontarCredito(email,creditosActuales){
  await fetch(`${SUPABASE_URL}/rest/v1/creditos?user_email=eq.${encodeURIComponent(email)}`,{
    method:"PATCH",
    headers:{"Content-Type":"application/json","apikey":SUPABASE_SECRET,"Authorization":`Bearer ${SUPABASE_SECRET}`},
    body:JSON.stringify({creditos_disponibles:creditosActuales-1})
  });
}

async function generarSesion(sesion, subnivel, asignatura, grado, secuencia){
  const etapas=secuencia==="ACC"
    ?[["Anticipación","activación de conocimientos previos"],["Construcción","construcción del conocimiento"],["Consolidación","transferencia y aplicación"]]
    :[["Experiencia","recuperación"],["Reflexión","comprensión"],["Conceptualización","análisis"],["Aplicación","utilización del conocimiento"]];

  const etapasDesc=etapas.map(([n,s])=>`${n} (${s})`).join(", ");
  const metStr=Array.isArray(sesion.metodologia)&&sesion.metodologia.length?sesion.metodologia.join(", "):"sin metodología específica";
  const compStr=sesion.competencias?.length?sesion.competencias.join(", "):"ninguna específica";
  const insStr=sesion.inserciones?.length?sesion.inserciones.join(", "):"ninguna específica";
  const neeStr=sesion.nee?.length?sesion.nee.map(n=>`Estudiante con ${n.tipo} (${n.adaptacion}${n.adaptacion==='Adaptación curricular'?`, nivel cognitivo equivalente a ${n.nivel_cognitivo}`:''})`).join("; "):"ninguno";
  const tema=sesion.tema||sesion.destreza.substring(0,50);

  const prompt=`Eres PLANIA, IA especializada en planificación curricular ecuatoriana con dominio en ${secuencia}, DUA y NEE.

Genera planificación COMPLETA para esta sesión:
- Subnivel: ${subnivel}
- Asignatura: ${asignatura}
- Grado/Curso: ${grado}
- Duración: ${sesion.duracion} minutos
- Secuencia: ${secuencia} (${etapasDesc})
- Metodología de la ${etapas[0][0]}: ${metStr}
- Destreza: ${sesion.destreza}
- Indicador: ${sesion.indicador}
- Tema: ${tema}
- Competencias: ${compStr}
- Inserciones: ${insStr}
- NEE: ${neeStr}

REGLAS:
1. Actividades inician con verbo en infinitivo
2. Cada etapa tiene los 3 principios DUA completos y detallados
3. La ${etapas[0][0]} usa OBLIGATORIAMENTE la metodología: ${metStr}
4. Actividades colaborativas, kinestésicas, sin tecnología
5. Inserciones integradas naturalmente en cada etapa
6. Objetivo generado coherente con destreza y tema
7. Rúbrica: 4 criterios × 4 niveles (Excelente/Satisfactorio/En proceso/Necesita apoyo)
8. NEE adaptación curricular: genera destreza e indicador modificados
9. NEE ajuste razonable: solo estrategias de apoyo, sin modificar destreza ni indicador
10. Redacción humanizada, pedagógicamente sólida

Responde ÚNICAMENTE con JSON válido sin markdown:
{
  "tema": "${tema}",
  "objetivo": "objetivo coherente con la destreza",
  "ejes_transversales": "competencias e inserciones como ejes",
  "etapas": {
    "${etapas[0][0].toLowerCase()}": {"nombre":"","actividad":"mínimo 5 oraciones con verbo en infinitivo","representacion":"mínimo 2 oraciones","accion":"mínimo 2 oraciones","implicacion":"mínimo 2 oraciones","insercion":"integración curricular"},
    "${etapas[1][0].toLowerCase()}": {"nombre":"","actividad":"","representacion":"","accion":"","implicacion":"","insercion":""},
    "${etapas[2][0].toLowerCase()}": {"nombre":"","actividad":"","representacion":"","accion":"","implicacion":"","insercion":""}
    ${etapas.length===4?`, "${etapas[3][0].toLowerCase()}": {"nombre":"","actividad":"","representacion":"","accion":"","implicacion":"","insercion":""}`:``}
  },
  "recursos": "recursos separados por coma",
  "tecnica": "técnica de evaluación",
  "instrumento": "instrumento de evaluación",
  "rubrica": [
    {"criterio":"criterio 1","excelente":"","satisfactorio":"","en_proceso":"","necesita_apoyo":""},
    {"criterio":"criterio 2","excelente":"","satisfactorio":"","en_proceso":"","necesita_apoyo":""},
    {"criterio":"criterio 3","excelente":"","satisfactorio":"","en_proceso":"","necesita_apoyo":""},
    {"criterio":"criterio 4","excelente":"","satisfactorio":"","en_proceso":"","necesita_apoyo":""}
  ],
  "adaptaciones_nee": [${sesion.nee?.length?sesion.nee.map(n=>`{"tipo":"${n.tipo}","adaptacion":"${n.adaptacion}","grado_actual":"${n.grado_actual||grado}","nivel_cognitivo":"${n.nivel_cognitivo||''}","destreza_modificada":"${n.adaptacion==='Adaptación curricular'?'destreza reducida en complejidad':'no aplica'}","indicador_modificado":"${n.adaptacion==='Adaptación curricular'?'indicador de menor complejidad':'no aplica'}","estrategias":"estrategias por etapa ${secuencia}","ajuste_evaluacion":"cómo se adapta la evaluación"}`).join(","):''}]
}`;

  const r=await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":`Bearer ${OPENAI_KEY}`},
    body:JSON.stringify({model:"gpt-4o",max_tokens:4000,temperature:0.7,
      messages:[
        {role:"system",content:"Eres PLANIA, experta en currículo ecuatoriano. Responde ÚNICAMENTE con JSON válido sin markdown."},
        {role:"user",content:prompt}
      ]})
  });

  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error?.message||`Error OpenAI ${r.status}`);}
  const d=await r.json();
  const raw=d.choices[0].message.content.trim();
  try{return JSON.parse(raw.replace(/```json|```/g,"").trim());}
  catch{throw new Error("PLANIA no devolvió JSON válido. Intenta de nuevo.");}
}

exports.handler=async(event)=>{
  const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
  if(event.httpMethod==="OPTIONS")return{statusCode:200,headers,body:""};
  if(event.httpMethod!=="POST")return{statusCode:405,headers,body:JSON.stringify({error:"Método no permitido"})};

  try{
    const body=JSON.parse(event.body);

    // VERIFICAR CRÉDITOS
    if(body.action==="verificar"){
      const{email}=body;
      if(!email)return{statusCode:400,headers,body:JSON.stringify({error:"Email requerido"})};
      let u=await obtenerUsuario(email);
      if(!u)u=await crearUsuario(email);
      if(!u)return{statusCode:500,headers,body:JSON.stringify({error:"No se pudo crear el usuario"})};
      return{statusCode:200,headers,body:JSON.stringify({creditos:u.creditos_disponibles,plan:u.plan})};
    }

    // GENERAR PLANIFICACIÓN
    const{email,subnivel,asignatura,grado,secuencia,sesiones}=body;
    if(!email)return{statusCode:400,headers,body:JSON.stringify({error:"Email requerido"})};
    if(!OPENAI_KEY)return{statusCode:500,headers,body:JSON.stringify({error:"API key no configurada."})};
    if(!SUPABASE_SECRET)return{statusCode:500,headers,body:JSON.stringify({error:"Supabase no configurado."})};
    if(!sesiones?.length)return{statusCode:400,headers,body:JSON.stringify({error:"No hay sesiones definidas"})};

    let usuario=await obtenerUsuario(email);
    if(!usuario)usuario=await crearUsuario(email);
    if(!usuario)return{statusCode:500,headers,body:JSON.stringify({error:"No se pudo verificar el usuario."})};
    if(usuario.creditos_disponibles<=0)return{statusCode:403,headers,body:JSON.stringify({error:"Sin créditos disponibles.",sin_creditos:true})};

    // Generar todas las sesiones
    const resultados=[];
    for(const sesion of sesiones){
      const plan=await generarSesion(sesion,subnivel,asignatura,grado,secuencia);
      resultados.push({sesion:sesion.numero,plan});
    }

    // Descontar UN crédito (toda la planificación cuenta como 1 crédito)
    await descontarCredito(email,usuario.creditos_disponibles);

    return{statusCode:200,headers,body:JSON.stringify({resultados,creditos_restantes:usuario.creditos_disponibles-1})};

  }catch(err){
    return{statusCode:500,headers,body:JSON.stringify({error:err.message||"Error interno."})};
  }
};
