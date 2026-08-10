const SUPABASE_URL = "https://ameezpthwyatnfprpkbn.supabase.co";
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

async function supabase(method, path, body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SECRET,
      "Authorization": `Bearer ${SUPABASE_SECRET}`,
      "Prefer": method === "POST" ? "return=representation" : ""
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  return r.ok ? r.json() : null;
}

async function obtenerCreditos(email) {
  const data = await supabase("GET", `creditos?user_email=eq.${encodeURIComponent(email)}&select=*`);
  return data?.[0] || null;
}

async function crearUsuario(email) {
  const data = await supabase("POST", "creditos", {
    user_email: email,
    creditos_disponibles: 4,
    plan: "gratuito"
  });
  return data?.[0] || null;
}

async function descontarCredito(email) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/creditos?user_email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SECRET,
      "Authorization": `Bearer ${SUPABASE_SECRET}`,
      "Prefer": "return=representation"
    },
    body: JSON.stringify({ creditos_disponibles: null })
  });
  // Usar RPC para decrementar de forma segura
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/descontar_credito`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SECRET,
      "Authorization": `Bearer ${SUPABASE_SECRET}`
    },
    body: JSON.stringify({ p_email: email })
  });
  return rpc.ok;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Método no permitido" }) };

  try {
    const body = JSON.parse(event.body);

    // ── ENDPOINT: verificar créditos ──
    if (body.action === "verificar") {
      const { email } = body;
      if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: "Email requerido" }) };
      let usuario = await obtenerCreditos(email);
      if (!usuario) usuario = await crearUsuario(email);
      if (!usuario) return { statusCode: 500, headers, body: JSON.stringify({ error: "No se pudo crear el usuario" }) };
      return { statusCode: 200, headers, body: JSON.stringify({
        creditos: usuario.creditos_disponibles,
        plan: usuario.plan,
        fecha_renovacion: usuario.fecha_renovacion
      })};
    }

    // ── ENDPOINT: generar planificación ──
    const {
      email, subnivel, asignatura, grado, periodos, minutos,
      secuencia, metodologia, destreza, indicador, tema,
      competencias, inserciones, nee
    } = body;

    if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: "Email requerido" }) };
    if (!OPENAI_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: "API key no configurada." }) };
    if (!SUPABASE_SECRET) return { statusCode: 500, headers, body: JSON.stringify({ error: "Supabase no configurado." }) };

    // Verificar créditos
    let usuario = await obtenerCreditos(email);
    if (!usuario) usuario = await crearUsuario(email);
    if (!usuario) return { statusCode: 500, headers, body: JSON.stringify({ error: "No se pudo verificar el usuario." }) };
    if (usuario.creditos_disponibles <= 0) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Sin créditos disponibles. Renueva tu membresía para continuar.", sin_creditos: true }) };
    }

    const compStr = competencias?.length ? competencias.join(", ") : "ninguna específica";
    const insStr  = inserciones?.length  ? inserciones.join(", ")  : "ninguna específica";
    const metStr  = Array.isArray(metodologia) && metodologia.length ? metodologia.join(", ") : "sin metodología específica";

    const etapas = secuencia === "ACC"
      ? ["Anticipación", "Construcción", "Consolidación"]
      : ["Experiencia", "Reflexión", "Conceptualización", "Aplicación"];

    const etapasDesc = secuencia === "ACC"
      ? "ACC: Anticipación (activación de conocimientos previos), Construcción (construcción del conocimiento), Consolidación (transferencia y aplicación)"
      : "ERCA: Experiencia (recuperación), Reflexión (comprensión), Conceptualización (análisis), Aplicación (utilización del conocimiento)";

    const neeStr = nee?.length
      ? nee.map(n => `Estudiante con ${n.tipo} (${n.adaptacion}${n.adaptacion === 'Adaptación curricular' ? `, nivel cognitivo equivalente a ${n.nivel_cognitivo}` : ''})`).join("; ")
      : "ninguno";

    const prompt = `Eres PLANIA, una IA especializada en planificación curricular ecuatoriana con dominio en la secuencia ${secuencia}, Diseño Universal para el Aprendizaje (DUA) y adaptaciones pedagógicas para NEE.

Genera una planificación de clase completa con estos datos:
- Subnivel: ${subnivel}
- Asignatura: ${asignatura}
- Grado/Curso: ${grado}
- Períodos pedagógicos: ${periodos} (${minutos} minutos)
- Secuencia didáctica: ${secuencia} (${etapasDesc})
- Metodología de la ${etapas[0]}: ${metStr}
- Destreza: ${destreza}
- Indicador de logro: ${indicador}
- Tema: ${tema}
- Énfasis en competencias: ${compStr}
- Inserciones curriculares: ${insStr}
- Estudiantes con NEE: ${neeStr}

REGLAS OBLIGATORIAS:
1. Todas las actividades inician con verbo en infinitivo
2. Cada etapa tiene sus tres principios DUA detallados y específicos al tema
3. La ${etapas[0]} usa OBLIGATORIAMENTE la metodología: ${metStr}
4. Actividades colaborativas, kinestésicas, sin tecnología
5. Las inserciones curriculares se integran naturalmente en cada etapa
6. El objetivo debe ser generado por ti, coherente con la destreza y el tema
7. La rúbrica debe tener 4 criterios con 4 niveles: Excelente(4), Satisfactorio(3), En proceso(2), Necesita apoyo(1)
8. Para NEE con ADAPTACIÓN CURRICULAR: genera destreza modificada (complejidad reducida) e indicador modificado
9. Para NEE con AJUSTE RAZONABLE: solo estrategias de apoyo, sin modificar destreza ni indicador
10. Redacción humanizada, detallada, pedagógicamente sólida

Responde ÚNICAMENTE con este JSON exacto (sin markdown, sin texto adicional):
{
  "tema": "tema de la clase",
  "objetivo": "objetivo generado coherente con la destreza y el tema",
  "ejes_transversales": "lista de inserciones y competencias como ejes transversales",
  "etapas": {
    "${etapas[0].toLowerCase()}": {
      "nombre": "nombre descriptivo de la actividad",
      "actividad": "descripción detallada iniciando con verbo en infinitivo, mínimo 5 oraciones",
      "representacion": "principio DUA Representación, mínimo 2 oraciones",
      "accion": "principio DUA Acción y expresión, mínimo 2 oraciones",
      "implicacion": "principio DUA Implicación, mínimo 2 oraciones",
      "insercion": "cómo se integra la inserción curricular en esta etapa"
    },
    "${etapas[1].toLowerCase()}": {
      "nombre": "nombre descriptivo",
      "actividad": "descripción detallada iniciando con verbo en infinitivo, mínimo 5 oraciones",
      "representacion": "principio DUA Representación",
      "accion": "principio DUA Acción y expresión",
      "implicacion": "principio DUA Implicación",
      "insercion": "integración de inserción curricular"
    },
    "${etapas[2].toLowerCase()}": {
      "nombre": "nombre descriptivo",
      "actividad": "descripción detallada iniciando con verbo en infinitivo, mínimo 5 oraciones",
      "representacion": "principio DUA Representación",
      "accion": "principio DUA Acción y expresión",
      "implicacion": "principio DUA Implicación",
      "insercion": "integración de inserción curricular"
    }
    ${etapas.length === 4 ? `, "${etapas[3].toLowerCase()}": {
      "nombre": "nombre descriptivo",
      "actividad": "descripción detallada iniciando con verbo en infinitivo, mínimo 5 oraciones",
      "representacion": "principio DUA Representación",
      "accion": "principio DUA Acción y expresión",
      "implicacion": "principio DUA Implicación",
      "insercion": "integración de inserción curricular"
    }` : ''}
  },
  "recursos": "lista de recursos concretos separados por coma",
  "tecnica": "técnica de evaluación apropiada",
  "instrumento": "rúbrica analítica o lista de cotejo según corresponda",
  "rubrica": [
    {"criterio": "criterio 1", "excelente": "descriptor nivel 4", "satisfactorio": "descriptor nivel 3", "en_proceso": "descriptor nivel 2", "necesita_apoyo": "descriptor nivel 1"},
    {"criterio": "criterio 2", "excelente": "descriptor", "satisfactorio": "descriptor", "en_proceso": "descriptor", "necesita_apoyo": "descriptor"},
    {"criterio": "criterio 3", "excelente": "descriptor", "satisfactorio": "descriptor", "en_proceso": "descriptor", "necesita_apoyo": "descriptor"},
    {"criterio": "criterio 4", "excelente": "descriptor", "satisfactorio": "descriptor", "en_proceso": "descriptor", "necesita_apoyo": "descriptor"}
  ],
  "adaptaciones_nee": [
    ${nee?.length ? nee.map(n => `{
      "tipo": "${n.tipo}",
      "adaptacion": "${n.adaptacion}",
      "grado_actual": "${n.grado_actual || grado}",
      "nivel_cognitivo": "${n.nivel_cognitivo || ''}",
      "destreza_modificada": "${n.adaptacion === 'Adaptación curricular' ? 'destreza con complejidad reducida coherente con el nivel cognitivo equivalente' : 'no aplica'}",
      "indicador_modificado": "${n.adaptacion === 'Adaptación curricular' ? 'indicador de menor complejidad coherente con la destreza modificada' : 'no aplica'}",
      "estrategias": "estrategias específicas por cada etapa ${secuencia} adaptadas a esta NEE",
      "ajuste_evaluacion": "cómo se adapta la evaluación para este estudiante"
    }`).join(",") : ''}
  ]
}`;

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 4000,
        temperature: 0.7,
        messages: [
          { role: "system", content: "Eres PLANIA, experta en currículo ecuatoriano, secuencias ERCA y ACC, DUA y NEE. Respondes ÚNICAMENTE con JSON válido sin markdown." },
          { role: "user", content: prompt }
        ]
      }),
    });

    if (!aiResp.ok) {
      const err = await aiResp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Error OpenAI: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const raw = aiData.choices[0].message.content.trim();
    let plan;
    try { plan = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
    catch { throw new Error("PLANIA no devolvió un JSON válido. Intenta de nuevo."); }

    // Descontar crédito usando UPDATE directo
    await fetch(`${SUPABASE_URL}/rest/v1/creditos?user_email=eq.${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SECRET,
        "Authorization": `Bearer ${SUPABASE_SECRET}`
      },
      body: JSON.stringify({ creditos_disponibles: usuario.creditos_disponibles - 1 })
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        plan,
        creditos_restantes: usuario.creditos_disponibles - 1
      })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || "Error interno." }) };
  }
};
