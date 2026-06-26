// Valores predeterminados en memoria por si falla la carga del archivo
let valores_defecto = {
  validar_cc: true,
  correos_cc: ["registro@empresa.com"],
  validar_asunto: true,
  palabras_asunto: [{ valor: "REGISTRO", es_regex: false }],
  validar_adjuntos: true
};

// Estado local de la configuración
let config_actual = { ...valores_defecto };

// Cargar valores desde el archivo de configuración y luego inicializar
const ruta_config = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
  ? chrome.runtime.getURL("configuracion.json")
  : "configuracion.json";

fetch(ruta_config)
  .then(res => res.json())
  .then(datos => {
    valores_defecto = datos;
    inicializar_configuracion();
  })
  .catch(() => {
    inicializar_configuracion();
  });

function inicializar_configuracion() {
  config_actual = { ...valores_defecto };

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(valores_defecto, (elementos) => {
      config_actual = elementos;
    });

    // Escuchar cambios en la configuración
    chrome.storage.onChanged.addListener((cambios, area) => {
      if (area === "sync") {
        for (let [clave, { newValue }] of Object.entries(cambios)) {
          if (newValue !== undefined) {
            config_actual[clave] = newValue;
          }
        }
      }
    });
  } else {
    // Cargar de localStorage si no está disponible el almacenamiento de Chrome
    for (const clave in valores_defecto) {
      const guardado = localStorage.getItem(clave);
      if (guardado !== null) {
        try {
          config_actual[clave] = JSON.parse(guardado);
        } catch (error) {
          config_actual[clave] = valores_defecto[clave];
        }
      }
    }
  }
}

// Función para buscar el botón de enviar
function obtener_botón_enviar() {
  // Busca botones con etiquetas comunes en inglés y español
  return document.querySelector(
    'button[aria-label*="Send" i], button[aria-label*="Enviar" i], button[title*="Send" i], button[title*="Enviar" i]'
  );
}

// Función para obtener el asunto del correo
function obtener_asunto() {
  // Buscar por id que termina en _SUBJECT (edición o lectura)
  const elementos_asunto = document.querySelectorAll('[id$="_SUBJECT"]');
  for (const el of elementos_asunto) {
    if (el.tagName.toLowerCase() === "input" && el.value.trim().length > 0) {
      return el.value.trim();
    }
    // Buscar texto en el contenido o atributos
    const texto = el.textContent || el.getAttribute("title") || el.getAttribute("aria-label") || "";
    if (texto.trim().length > 0) {
      return texto.trim();
    }
  }

  // Buscar por clase o contenedor de asunto en lectura
  const elemento_clase_subject = document.querySelector('span.JdFsz, .f77rj span');
  if (elemento_clase_subject) {
    const texto = elemento_clase_subject.textContent || elemento_clase_subject.getAttribute("title") || "";
    if (texto.trim().length > 0) {
      return texto.trim();
    }
  }

  // Buscar por selectores alternativos
  const selector_asunto = document.querySelector(
    'input[aria-label*="Subject" i], input[aria-label*="asunto" i], input[placeholder*="Subject" i], input[placeholder*="asunto" i]'
  );
  if (selector_asunto) {
    return selector_asunto.value;
  }

  const cabecera_asunto = document.querySelector(
    '[role="heading"][aria-level="1"], div[data-testid="conversationsHeader"], div.SubjectText, h1'
  );
  return cabecera_asunto ? cabecera_asunto.textContent : "";
}

// Función para obtener los correos en Cc
function obtener_correos_cc() {
  const lista_cc = [];
  const boton_enviar = obtener_botón_enviar();
  // Busca el contenedor de redaccion activo
  const contenedor_redaccion = boton_enviar 
    ? (boton_enviar.closest('.yz4r1') || boton_enviar.closest('.ComposeCard') || boton_enviar.closest('[role="region"]') || document) 
    : document;

  // Buscar contenedor de CC solo en el panel activo
  let contenedor_cc = contenedor_redaccion.querySelector('[id$="_CC"], [aria-label="CC"]');
  if (!contenedor_cc) {
    contenedor_cc = contenedor_redaccion.querySelector('[aria-label*="Cc" i], [aria-label*="Copia" i]');
  }

  if (contenedor_cc) {
    // Buscar destinatarios que tengan formato de correo en atributos o texto
    const elementos = contenedor_cc.querySelectorAll('span._Entity, [aria-label*="@"], [title*="@"], div, span');
    elementos.forEach((el) => {
      const fuentes = [
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
        el.textContent
      ];
      fuentes.forEach((texto) => {
        if (texto && texto.includes("@")) {
          const coincidencias = texto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
          if (coincidencias) {
            coincidencias.forEach((email) => {
              const email_limpio = email.trim().toLowerCase();
              if (!lista_cc.includes(email_limpio)) {
                lista_cc.push(email_limpio);
              }
            });
          }
        }
      });
    });
  }
  return lista_cc;
}

// Función para comprobar si hay archivos adjuntos
function tiene_adjuntos() {
  const boton_enviar = obtener_botón_enviar();
  // Busca el contenedor de redaccion activo
  const contenedor_redaccion = boton_enviar 
    ? (boton_enviar.closest('.yz4r1') || boton_enviar.closest('.ComposeCard') || boton_enviar.closest('[role="region"]') || document) 
    : document;

  // Buscar elementos de adjuntos solo en el panel activo
  const adjuntos = contenedor_redaccion.querySelectorAll(
    '[aria-label*="attachment" i], [aria-label*="adjunto" i], [class*="attachment" i], [class*="adjunto" i], [data-testid*="Attachment" i]'
  );
  
  let cantidad_adjuntos = 0;
  adjuntos.forEach((el) => {
    const es_boton = el.tagName.toLowerCase() === "button" || el.getAttribute("role") === "button";
    const texto = el.textContent || "";
    if (!es_boton && texto.trim().length > 0) {
      cantidad_adjuntos++;
    } else if (el.getAttribute("data-testid") === "AttachmentCard") {
      cantidad_adjuntos++;
    }
  });
  
  return cantidad_adjuntos > 0;
}

// Función para mostrar la advertencia
function mostrar_alerta(errores) {
  // Remover alerta anterior si existe
  const alerta_previa = document.getElementById("alerta-asistente-correo");
  if (alerta_previa) {
    alerta_previa.remove();
  }

  // Crear contenedor de la alerta con diseño elegante
  const contenedor = document.createElement("div");
  contenedor.id = "alerta-asistente-correo";
  contenedor.style.position = "fixed";
  contenedor.style.top = "20px";
  contenedor.style.right = "20px";
  contenedor.style.backgroundColor = "#ffdddd";
  contenedor.style.color = "#a00000";
  contenedor.style.borderLeft = "6px solid #f44336";
  contenedor.style.padding = "15px";
  contenedor.style.borderRadius = "4px";
  contenedor.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
  contenedor.style.zIndex = "99999";
  contenedor.style.fontFamily = "Segoe UI, sans-serif";
  contenedor.style.fontSize = "14px";
  contenedor.style.maxWidth = "350px";

  const titulo = document.createElement("strong");
  titulo.textContent = "Requisitos faltantes para enviar:";
  titulo.style.display = "block";
  titulo.style.marginBottom = "5px";
  contenedor.appendChild(titulo);

  const lista = document.createElement("ul");
  lista.style.margin = "0";
  lista.style.paddingLeft = "20px";
  errores.forEach((error) => {
    const item = document.createElement("li");
    item.textContent = error;
    lista.appendChild(item);
  });
  contenedor.appendChild(lista);

  // Agregar botón para cerrar
  const boton_cerrar = document.createElement("span");
  boton_cerrar.textContent = "×";
  boton_cerrar.style.position = "absolute";
  boton_cerrar.style.top = "5px";
  boton_cerrar.style.right = "10px";
  boton_cerrar.style.cursor = "pointer";
  boton_cerrar.style.fontSize = "20px";
  boton_cerrar.style.fontWeight = "bold";
  boton_cerrar.onclick = () => contenedor.remove();
  contenedor.appendChild(boton_cerrar);

  document.body.appendChild(contenedor);

  // Auto-eliminar después de 7 segundos
  setTimeout(() => {
    if (contenedor.parentNode) {
      contenedor.remove();
    }
  }, 7000);
}

// Función principal para validar el correo
function validar_correo(evento) {
  const lista_errores = [];

  // 1. Validar Cc si está habilitado
  if (config_actual.validar_cc) {
    const correos_en_cc = obtener_correos_cc();
    const faltan_correos = config_actual.correos_cc.filter(
      (correo) => !correos_en_cc.includes(correo.toLowerCase())
    );
    if (faltan_correos.length > 0) {
      lista_errores.push(`Faltan correos requeridos en Cc: ${faltan_correos.join(", ")}`);
    }
  }

  // 2. Validar Asunto si está habilitado
  if (config_actual.validar_asunto) {
    const texto_asunto = obtener_asunto();
    const patrones_fallidos = [];
    
    config_actual.palabras_asunto.forEach((item) => {
      if (item.es_regex) {
        try {
          const regex_obj = new RegExp(item.valor, "i");
          if (!regex_obj.test(texto_asunto)) {
            patrones_fallidos.push(`expresión "${item.valor}"`);
          }
        } catch (error) {
          // Ignorar si la expresión regular no es válida
        }
      } else {
        if (!texto_asunto.toLowerCase().includes(item.valor.toLowerCase())) {
          patrones_fallidos.push(`"${item.valor}"`);
        }
      }
    });

    if (patrones_fallidos.length > 0) {
      lista_errores.push(`El asunto debe incluir: ${patrones_fallidos.join(", ")}`);
    }
  }

  // 3. Validar Adjuntos si está habilitado
  if (config_actual.validar_adjuntos) {
    const modo_adjuntos = config_actual.modo_adjuntos || "requerido";
    if (modo_adjuntos === "requerido" && !tiene_adjuntos()) {
      lista_errores.push("Falta agregar archivos adjuntos");
    } else if (modo_adjuntos === "no_permitido" && tiene_adjuntos()) {
      lista_errores.push("No se permiten archivos adjuntos");
    }
  }

  // Interceptar si hay errores
  if (lista_errores.length > 0) {
    evento.preventDefault();
    evento.stopPropagation();
    mostrar_alerta(lista_errores);
    return false;
  }

  return true;
}

// Interceptar eventos de clic y teclado
document.addEventListener(
  "click",
  (evento) => {
    const elemento = evento.target.closest("button");
    if (elemento) {
      const boton_enviar = obtener_botón_enviar();
      if (boton_enviar && (elemento === boton_enviar || boton_enviar.contains(elemento))) {
        validar_correo(evento);
      }
    }
  },
  true
);

document.addEventListener(
  "keydown",
  (evento) => {
    // Interceptar Ctrl+Enter para enviar
    if ((evento.ctrlKey || evento.metaKey) && evento.key === "Enter") {
      validar_correo(evento);
    }
  },
  true
);

// Escuchar mensajes del popup
chrome.runtime.onMessage.addListener((mensaje, remitente, responder_estado) => {
  // Sincronizar la configuración si se proporciona en el mensaje
  if (mensaje.config) {
    config_actual = mensaje.config;
    // Si no hay API de almacenamiento de Chrome, guardar localmente
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.sync) {
      for (const clave in config_actual) {
        localStorage.setItem(clave, JSON.stringify(config_actual[clave]));
      }
    }
  }

  if (mensaje.accion === "obtener_estado") {
    const texto_asunto = obtener_asunto();
    const correos_en_cc = obtener_correos_cc();
    
    // Verificar cuáles correos faltan en Cc
    const faltan_correos = config_actual.correos_cc.filter(
      (correo) => !correos_en_cc.includes(correo.toLowerCase())
    );

    // Verificar si el asunto cumple con las palabras clave o expresiones regulares
    let asunto_correcto = true;
    if (config_actual.palabras_asunto.length > 0) {
      config_actual.palabras_asunto.forEach((item) => {
        if (item.es_regex) {
          try {
            const regex_obj = new RegExp(item.valor, "i");
            if (!regex_obj.test(texto_asunto)) {
              asunto_correcto = false;
            }
          } catch (e) {
            asunto_correcto = false;
          }
        } else {
          if (!texto_asunto.toLowerCase().includes(item.valor.toLowerCase())) {
            asunto_correcto = false;
          }
        }
      });
    }

    const modo_adjuntos = config_actual.modo_adjuntos || "requerido";
    let adjuntos_correcto = true;
    if (config_actual.validar_adjuntos) {
      if (modo_adjuntos === "requerido") {
        adjuntos_correcto = tiene_adjuntos();
      } else if (modo_adjuntos === "no_permitido") {
        adjuntos_correcto = !tiene_adjuntos();
      }
    }
    responder_estado({
      cc_correcto: faltan_correos.length === 0,
      correos_faltantes: faltan_correos,
      asunto_correcto: asunto_correcto,
      adjuntos_correcto: adjuntos_correcto
    });
  } else if (mensaje.accion === "actualizar_config") {
    if (responder_estado) {
      responder_estado({ ok: true });
    }
  }
  return true;
});
