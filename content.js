// Valores predeterminados en memoria por si falla la carga del archivo
let valores_defecto = {
  validar_cc: true,
  correos_cc: ["registro@empresa.com"],
  validar_asunto: true,
  palabras_asunto: [{ valor: "REGISTRO", es_regex: false }],
  validar_adjuntos: true,
  disparador: "todos"
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

// Normalizar el texto para una comparacion limpia
function normalizar_texto(texto) {
  if (!texto) return "";
  let normal = texto.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Quitar acentos
  return normal.replace(/[^a-z0-9]/g, ""); // Quitar espacios y caracteres especiales
}

// Comprobar si un destinatario coincide con el correo requerido
function coincide_destinatario(cc_item, correo_req) {
  const req_limpio = correo_req.toLowerCase().trim();
  const local_req = req_limpio.split("@")[0];

  const item_limpio = cc_item.toLowerCase().trim();
  const local_item = item_limpio.includes("@") ? item_limpio.split("@")[0] : item_limpio;

  const req_norm = normalizar_texto(req_limpio);
  const local_req_norm = normalizar_texto(local_req);
  const item_norm = normalizar_texto(item_limpio);
  const local_item_norm = normalizar_texto(local_item);

  return item_limpio === req_limpio || 
         item_limpio.includes(req_limpio) || 
         item_norm === req_norm ||
         local_item_norm === local_req_norm ||
         item_norm.includes(local_req_norm) ||
         local_req_norm.includes(item_norm);
}

// Obtener el contenedor del panel de redacción activo
function obtener_contenedor_redaccion(elemento_origen) {
  if (!elemento_origen) {
    // Buscar el boton de enviar
    const boton_enviar = obtener_botón_enviar();
    return boton_enviar ? obtener_contenedor_redaccion(boton_enviar) : document;
  }

  // Buscar el formulario de redaccion completo
  const form_completo = elemento_origen.closest('[data-testid="ComposeForm"], .ComposeCard, [role="region"]');
  if (form_completo) {
    return form_completo;
  }

  // Buscar por ancestro comun
  let actual = elemento_origen;
  while (actual && actual !== document.body && actual !== document.documentElement) {
    // Validar cuerpo y controles de redaccion
    const tiene_cuerpo = actual.querySelector('div[contenteditable="true"], div[role="textbox"]');
    const tiene_controles = actual.querySelector('[data-testid="ComposeSendButton"], [id$="_TO"], [aria-label="Para"], [id$="_CC"], [aria-label="CC"]');

    if (tiene_cuerpo && tiene_controles) {
      return actual;
    }
    actual = actual.parentElement;
  }

  return document;
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
function obtener_correos_cc(contenedor_redaccion = document) {
  const lista_cc = [];
  let contenedor_real = contenedor_redaccion;

  // Subir por el DOM para buscar destinatarios
  if (contenedor_redaccion && contenedor_redaccion !== document) {
    const form_completo = contenedor_redaccion.closest('[data-testid="ComposeForm"], .ComposeCard, [role="region"]');
    if (form_completo) {
      contenedor_real = form_completo;
    } else {
      let actual = contenedor_redaccion;
      while (actual && actual !== document.body) {
        if (actual.querySelector('[id$="_TO"], [aria-label="Para" i], [id$="_CC"], [aria-label="Cc" i]')) {
          contenedor_real = actual;
          break;
        }
        actual = actual.parentElement;
      }
    }
  }

  // Buscar contenedores de destinatarios específicos (Para, Cc, Cco)
  const contenedores_destinatarios = contenedor_real.querySelectorAll(
    '[id$="_TO"], [id$="_CC"], [id$="_BCC"], [aria-label="Para" i], [aria-label="Cc" i], [aria-label="Cco" i], [aria-label="To" i], [aria-label="Bcc" i]'
  );

  // Si encontramos contenedores específicos, buscar dentro de ellos; si no, en todo el contenedor
  const buscar_en = contenedores_destinatarios.length > 0 
    ? Array.from(contenedores_destinatarios) 
    : [contenedor_real];

  buscar_en.forEach((contenedor) => {
    // Evitar procesar botones que coincidan por error
    if (contenedor.tagName.toLowerCase() === 'button') {
      return;
    }

    // Buscar destinatarios y sus nombres o direcciones de correo
    const elementos = contenedor.querySelectorAll('span._Entity, [aria-label*="@"], [title*="@"], span[class*="textContainer-"], span[class*="pill-"]');
    elementos.forEach((el) => {
      // Guardar el nombre para mostrar si es una píldora de destinatario
      const es_pildora = el.classList.contains('_Entity') || 
                        Array.from(el.classList).some(c => c.startsWith('textContainer-') || c.startsWith('pill-'));
      if (es_pildora) {
        const nombre = el.textContent.trim().replace(/;$/, '').toLowerCase();
        if (nombre && !lista_cc.includes(nombre)) {
          lista_cc.push(nombre);
        }
      }

      const fuentes = [
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
        el.textContent
      ];
      fuentes.forEach((texto) => {
        if (texto) {
          if (texto.includes("@")) {
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
        }
      });
    });
  });

  return lista_cc;
}

// Función para comprobar si hay archivos adjuntos
function tiene_adjuntos(contenedor_redaccion = document) {
  let cantidad_adjuntos = 0;
  let contenedor_real = contenedor_redaccion;

  // Subir por el DOM para buscar adjuntos
  if (contenedor_redaccion && contenedor_redaccion !== document) {
    const form_completo = contenedor_redaccion.closest('[data-testid="ComposeForm"], .ComposeCard, [role="region"]');
    if (form_completo) {
      contenedor_real = form_completo;
    } else {
      let actual = contenedor_redaccion;
      while (actual && actual !== document.body) {
        if (actual.querySelector('[aria-label*="attachment" i], [aria-label*="adjunto" i], [id$="_ATTACHMENTS"]')) {
          contenedor_real = actual;
          break;
        }
        actual = actual.parentElement;
      }
    }
  }

  // Buscar los contenedores de adjuntos en la redacción activa
  const contenedores_adjuntos = contenedor_real.querySelectorAll(
    '[aria-label*="attachment" i], [aria-label*="adjunto" i]'
  );

  // Determinar si hay redacción activa en la página
  const editor_activo = document.querySelector('div[contenteditable="true"], div[role="textbox"]');
  const en_modo_redaccion = !!editor_activo;

  contenedores_adjuntos.forEach((cont) => {
    // Si estamos redactando, ignorar contenedores de lectura anteriores
    if (en_modo_redaccion) {
      const es_lectura = cont.closest('.SlLx9, [aria-label="Mensaje de correo electrónico" i]');
      if (es_lectura) {
        return;
      }
    }
    // Contar las opciones o tarjetas de adjuntos individuales
    const archivos = cont.querySelectorAll('[role="option"], [data-testid="AttachmentCard"]');
    cantidad_adjuntos += archivos.length;
  });

  // Respaldo por si cambió la estructura de adjuntos
  if (cantidad_adjuntos === 0) {
    const adjuntos_genericos = contenedor_real.querySelectorAll(
      '[data-testid="AttachmentCard"], [class*="AttachmentCard" i]'
    );
    adjuntos_genericos.forEach((el) => {
      if (en_modo_redaccion) {
        const es_lectura = el.closest('.SlLx9, [aria-label="Mensaje de correo electrónico" i]');
        if (es_lectura) {
          return;
        }
      }
      cantidad_adjuntos++;
    });
  }
  
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
  // Obtener el contenedor del correo que se está redactando
  const elemento_origen = evento ? evento.target : null;
  const contenedor_redaccion = obtener_contenedor_redaccion(elemento_origen);

  // Comprobar si el correo actual cumple con el disparador seleccionado
  let se_debe_validar = false;
  const disparador = config_actual.disparador || "todos";

  if (disparador === "todos") {
    se_debe_validar = true;
  } else if (disparador === "asunto") {
    const texto_asunto = obtener_asunto();
    se_debe_validar = config_actual.palabras_asunto.some((item) => {
      if (item.es_regex) {
        try {
          return new RegExp(item.valor, "i").test(texto_asunto);
        } catch (error) {
          // Ignorar expresiones no válidas
          return false;
        }
      }
      return texto_asunto.toLowerCase().includes(item.valor.toLowerCase());
    });
  } else if (disparador === "cc") {
    const correos_en_cc = obtener_correos_cc(contenedor_redaccion);
    se_debe_validar = config_actual.correos_cc.some((correo_req) => {
      return correos_en_cc.some((cc_item) => coincide_destinatario(cc_item, correo_req));
    });
  } else if (disparador === "adjuntos") {
    se_debe_validar = tiene_adjuntos(contenedor_redaccion);
  }

  // Si no cumple la condicion del disparador se envia directamente
  if (!se_debe_validar) {
    return true;
  }

  const lista_errores = [];

  // 1. Validar Cc si está habilitado
  if (config_actual.validar_cc) {
    const correos_en_cc = obtener_correos_cc(contenedor_redaccion);
    const faltan_correos = config_actual.correos_cc.filter((correo_req) => {
      return !correos_en_cc.some((cc_item) => coincide_destinatario(cc_item, correo_req));
    });
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
    if (modo_adjuntos === "requerido" && !tiene_adjuntos(contenedor_redaccion)) {
      lista_errores.push("Falta agregar archivos adjuntos");
    } else if (modo_adjuntos === "no_permitido" && tiene_adjuntos(contenedor_redaccion)) {
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
    const boton_enviar = obtener_botón_enviar();
    const contenedor_redaccion = obtener_contenedor_redaccion(boton_enviar);
    const correos_en_cc = obtener_correos_cc(contenedor_redaccion);
    
    // Verificar cuáles correos faltan en Cc usando coincidencia inteligente
    const faltan_correos = config_actual.correos_cc.filter((correo_req) => {
      return !correos_en_cc.some((cc_item) => coincide_destinatario(cc_item, correo_req));
    });

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
        adjuntos_correcto = tiene_adjuntos(contenedor_redaccion);
      } else if (modo_adjuntos === "no_permitido") {
        adjuntos_correcto = !tiene_adjuntos(contenedor_redaccion);
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
