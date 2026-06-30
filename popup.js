// Obtener valores iniciales por defecto
function obtener_valores_predeterminados(callback) {
  const ruta_config = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
    ? chrome.runtime.getURL("configuracion.json")
    : "configuracion.json";

  fetch(ruta_config)
    .then(respuesta => respuesta.json())
    .then(datos => {
      callback(datos);
    })
    .catch(error => {
      // Valores de respaldo si falla el json
      callback({
        validar_cc: true,
        correos_cc: ["registro@empresa.com"],
        validar_asunto: true,
        palabras_asunto: [{ valor: "REGISTRO", es_regex: false }],
        validar_adjuntos: true,
        modo_adjuntos: "requerido",
        disparador: "todos"
      });
    });
}

// Almacenamiento local compatible con la extension
const almacenamiento = {
  obtener: (claves, callback) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(claves, callback);
    } else {
      const resultado = {};
      for (const clave in claves) {
        const guardado = localStorage.getItem(clave);
        if (guardado !== null) {
          try {
            resultado[clave] = JSON.parse(guardado);
          } catch (error) {
            resultado[clave] = claves[clave];
          }
        } else {
          resultado[clave] = claves[clave];
        }
      }
      callback(resultado);
    }
  },
  guardar: (objeto, callback) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(objeto, callback);
    } else {
      for (const clave in objeto) {
        localStorage.setItem(clave, JSON.stringify(objeto[clave]));
      }
      if (callback) {
        callback();
      }
    }
  }
};

// Se ejecuta al cargar la pantalla
document.addEventListener("DOMContentLoaded", () => {
  // Elementos de la navegacion
  const pestana_estado = document.getElementById("pestana-estado");
  const pestana_reglas = document.getElementById("pestana-reglas");
  const pestana_config = document.getElementById("pestana-config");

  // Alerta de storage
  const alerta_storage = document.getElementById("alerta-storage");
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.sync) {
    if (alerta_storage) {
      alerta_storage.style.display = "block";
    }
  }

  // Contenedores de las secciones
  const seccion_estado = document.getElementById("seccion-estado");
  const seccion_reglas = document.getElementById("seccion-reglas");
  const seccion_config = document.getElementById("seccion-config");

  // Botones de activacion (switches)
  const switch_cc = document.getElementById("switch-cc");
  const switch_asunto = document.getElementById("switch-asunto");
  const switch_adjuntos = document.getElementById("switch-adjuntos");

  // Selectores para adjuntos
  const btn_adjuntos_requerido = document.getElementById("btn-adjuntos-requerido");
  const btn_adjuntos_prohibido = document.getElementById("btn-adjuntos-prohibido");

  // Controles de entrada de datos
  const input_correo_cc = document.getElementById("input-correo-cc");
  const btn_agregar_cc = document.getElementById("btn-agregar-cc");
  const lista_correos_cc = document.getElementById("lista-correos-cc");

  const input_palabra_asunto = document.getElementById("input-palabra-asunto");
  const chk_asunto_regex = document.getElementById("chk-asunto-regex");
  const btn_agregar_asunto = document.getElementById("btn-agregar-asunto");
  const lista_palabras_asunto = document.getElementById("lista-palabras-asunto");

  const btn_restablecer = document.getElementById("btn-restablecer");
  const select_disparador = document.getElementById("select-disparador");

  // Textos y badges de las reglas
  const regla_cc_badge = document.getElementById("regla-cc-badge");
  const regla_cc_valores = document.getElementById("regla-cc-valores");
  
  const regla_asunto_badge = document.getElementById("regla-asunto-badge");
  const regla_asunto_valores = document.getElementById("regla-asunto-valores");
  
  const regla_adjuntos_badge = document.getElementById("regla-adjuntos-badge");
  const regla_adjuntos_valores = document.getElementById("regla-adjuntos-valores");
  
  const reglas_total_badge = document.getElementById("reglas-total-badge");

  // Elementos de estado
  const circulo_cc = document.getElementById("circulo-cc");
  const icono_cc = document.getElementById("icono-cc");
  const detalle_cc = document.getElementById("detalle-cc");
  const btn_corregir_cc = document.getElementById("btn-corregir-cc");

  const circulo_asunto = document.getElementById("circulo-asunto");
  const icono_asunto = document.getElementById("icono-asunto");
  const detalle_asunto = document.getElementById("detalle-asunto");
  const btn_ver_reglas = document.getElementById("btn-ver-reglas");

  const circulo_adjuntos = document.getElementById("circulo-adjuntos");
  const icono_adjuntos = document.getElementById("icono-adjuntos");
  const detalle_adjuntos = document.getElementById("detalle-adjuntos");
  const badge_valido_adjuntos = document.getElementById("badge-valido-adjuntos");

  const pantalla_error = document.getElementById("pantalla-error");

  let intervalo_actualizacion = null;

  // Configuracion activa en memoria
  let config_actual = {
    validar_cc: true,
    correos_cc: [],
    validar_asunto: true,
    palabras_asunto: [],
    validar_adjuntos: true,
    modo_adjuntos: "requerido",
    disparador: "todos"
  };

  // Inicia la actualización del estado cada 1.5 segundos
  function iniciar_actualizacion_automatica() {
    parar_actualizacion_automatica();
    actualizar_estado_validacion();
    intervalo_actualizacion = setInterval(actualizar_estado_validacion, 1500);
  }

  // Detiene la actualización periódica del estado
  function parar_actualizacion_automatica() {
    if (intervalo_actualizacion) {
      clearInterval(intervalo_actualizacion);
      intervalo_actualizacion = null;
    }
  }

  // Escuchadores de clics para cambiar pestanas
  pestana_estado.addEventListener("click", () => {
    activar_pestana(pestana_estado, seccion_estado);
    iniciar_actualizacion_automatica();
  });

  pestana_reglas.addEventListener("click", () => {
    activar_pestana(pestana_reglas, seccion_reglas);
    parar_actualizacion_automatica();
    renderizar_resumen_reglas();
  });

  pestana_config.addEventListener("click", () => {
    activar_pestana(pestana_config, seccion_config);
    parar_actualizacion_automatica();
  });

  // Alterna las vistas activas
  function activar_pestana(pestana_el, seccion_el) {
    [pestana_estado, pestana_reglas, pestana_config].forEach(p => p.classList.remove("activa"));
    [seccion_estado, seccion_reglas, seccion_config].forEach(s => s.classList.remove("activa"));
    pestana_el.classList.add("activa");
    seccion_el.classList.add("activa");

    // Ocultar error si cambiamos de pestaña
    if (pestana_el !== pestana_estado) {
      pantalla_error.style.display = "none";
    }
  }

  // Redirige del boton corregir Cc a la pestana correspondiente
  btn_corregir_cc.addEventListener("click", () => {
    if (btn_corregir_cc.textContent === "Configurar") {
      activar_pestana(pestana_config, seccion_config);
    } else {
      activar_pestana(pestana_reglas, seccion_reglas);
      renderizar_resumen_reglas();
    }
  });

  // Redirige de ver reglas a la pestana correspondiente
  btn_ver_reglas.addEventListener("click", () => {
    if (btn_ver_reglas.textContent === "Configurar") {
      activar_pestana(pestana_config, seccion_config);
    } else {
      activar_pestana(pestana_reglas, seccion_reglas);
      renderizar_resumen_reglas();
    }
  });

  // Carga la configuracion almacenada
  function cargar_configuracion() {
    obtener_valores_predeterminados((predeterminados) => {
      almacenamiento.obtener(predeterminados, (elementos) => {
        config_actual = elementos;
        // Asignar modo por defecto si no existe
        if (!config_actual.modo_adjuntos) {
          config_actual.modo_adjuntos = "requerido";
        }
        aplicar_valores_a_ui();
        renderizar_resumen_reglas();
        actualizar_estado_validacion();
      });
    });
  }

  // Guarda y transmite la configuracion
  function guardar_configuracion() {
    almacenamiento.guardar(config_actual, () => {
      renderizar_resumen_reglas();
      if (typeof chrome !== "undefined" && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (pestanas) => {
          const pestana_activa = pestanas[0];
          if (pestana_activa) {
            chrome.tabs.sendMessage(
              pestana_activa.id,
              { accion: "actualizar_config", config: config_actual },
              () => {
                if (chrome.runtime.lastError) {}
              }
            );
          }
        });
      }
    });
  }

  // Actualiza los elementos UI con la configuracion
  function aplicar_valores_a_ui() {
    // Estado de switches de activacion
    actualizar_switch_ui(switch_cc, config_actual.validar_cc);
    actualizar_switch_ui(switch_asunto, config_actual.validar_asunto);
    actualizar_switch_ui(switch_adjuntos, config_actual.validar_adjuntos);

    // Ajustar visibilidad de inputs secundarios
    document.getElementById("grupo-cc-inputs").style.display = config_actual.validar_cc ? "block" : "none";
    document.getElementById("grupo-asunto-inputs").style.display = config_actual.validar_asunto ? "block" : "none";
    document.getElementById("grupo-adjuntos-inputs").style.display = config_actual.validar_adjuntos ? "flex" : "none";

    // Selector de modo de adjuntos
    if (config_actual.modo_adjuntos === "no_permitido") {
      btn_adjuntos_requerido.classList.remove("seleccionado");
      btn_adjuntos_prohibido.classList.add("seleccionado");
    } else {
      btn_adjuntos_requerido.classList.add("seleccionado");
      btn_adjuntos_prohibido.classList.remove("seleccionado");
    }

    select_disparador.value = config_actual.disparador || "todos";

    renderizar_lista_cc();
    renderizar_lista_asunto();
  }

  // Visualizacion del switch de palanca
  function actualizar_switch_ui(elemento_switch, estado_activo) {
    if (estado_activo) {
      elemento_switch.classList.add("activo");
    } else {
      elemento_switch.classList.remove("activo");
    }
  }

  // Muestra correos Cc agregados
  function renderizar_lista_cc() {
    lista_correos_cc.innerHTML = "";
    config_actual.correos_cc.forEach((correo, indice) => {
      const tag = document.createElement("div");
      tag.className = "cc-tag";
      
      const texto = document.createElement("span");
      texto.textContent = correo;
      
      const btn_eliminar = document.createElement("span");
      btn_eliminar.className = "material-symbols-outlined delete";
      btn_eliminar.textContent = "close";
      btn_eliminar.addEventListener("click", () => {
        config_actual.correos_cc.splice(indice, 1);
        guardar_configuracion();
        renderizar_lista_cc();
      });

      tag.appendChild(texto);
      tag.appendChild(btn_eliminar);
      lista_correos_cc.appendChild(tag);
    });
  }

  // Muestra palabras clave de asunto agregadas
  function renderizar_lista_asunto() {
    lista_palabras_asunto.innerHTML = "";
    config_actual.palabras_asunto.forEach((item, indice) => {
      const item_el = document.createElement("div");
      item_el.className = "kw-item";

      const texto = document.createElement("span");
      texto.textContent = item.valor + (item.es_regex ? " (Regex)" : "");

      const btn_eliminar = document.createElement("span");
      btn_eliminar.className = "material-symbols-outlined delete";
      btn_eliminar.textContent = "delete";
      btn_eliminar.addEventListener("click", () => {
        config_actual.palabras_asunto.splice(indice, 1);
        guardar_configuracion();
        renderizar_lista_asunto();
      });

      item_el.appendChild(texto);
      item_el.appendChild(btn_eliminar);
      lista_palabras_asunto.appendChild(item_el);
    });
  }

  // Actualiza la tabla informativa de reglas
  function renderizar_resumen_reglas() {
    let reglas_activas_contador = 0;

    // Resumen Cc
    if (config_actual.validar_cc) {
      reglas_activas_contador++;
      regla_cc_badge.textContent = "Activo";
      regla_cc_badge.className = "badge-estado activo";
      regla_cc_valores.textContent = config_actual.correos_cc.length > 0 
        ? config_actual.correos_cc.join(", ") 
        : "Ninguno (lista vacía)";
    } else {
      regla_cc_badge.textContent = "Inactivo";
      regla_cc_badge.className = "badge-estado inactivo";
      regla_cc_valores.textContent = "Desactivado";
    }

    // Resumen Asunto
    if (config_actual.validar_asunto) {
      reglas_activas_contador++;
      regla_asunto_badge.textContent = "Activo";
      regla_asunto_badge.className = "badge-estado activo";
      
      const textos = config_actual.palabras_asunto.map(item => {
        return item.es_regex ? `Regex(${item.valor})` : `"${item.valor}"`;
      });
      regla_asunto_valores.textContent = textos.length > 0 
        ? textos.join(", ") 
        : "Ninguno (lista vacía)";
    } else {
      regla_asunto_badge.textContent = "Inactivo";
      regla_asunto_badge.className = "badge-estado inactivo";
      regla_asunto_valores.textContent = "Desactivado";
    }

    // Resumen Adjuntos
    if (config_actual.validar_adjuntos) {
      reglas_activas_contador++;
      regla_adjuntos_badge.textContent = "Activo";
      regla_adjuntos_badge.className = "badge-estado activo";
      regla_adjuntos_valores.textContent = config_actual.modo_adjuntos === "no_permitido"
        ? "No permitido"
        : "Requerido";
    } else {
      regla_adjuntos_badge.textContent = "Inactivo";
      regla_adjuntos_badge.className = "badge-estado inactivo";
      regla_adjuntos_valores.textContent = "Desactivado";
    }

    reglas_total_badge.textContent = reglas_activas_contador + " Total";
  }

  // Toggles de los switches
  switch_cc.addEventListener("click", () => {
    config_actual.validar_cc = !config_actual.validar_cc;
    guardar_configuracion();
    aplicar_valores_a_ui();
  });

  switch_asunto.addEventListener("click", () => {
    config_actual.validar_asunto = !config_actual.validar_asunto;
    guardar_configuracion();
    aplicar_valores_a_ui();
  });

  switch_adjuntos.addEventListener("click", () => {
    config_actual.validar_adjuntos = !config_actual.validar_adjuntos;
    guardar_configuracion();
    aplicar_valores_a_ui();
  });

  // Selector de adjuntos
  btn_adjuntos_requerido.addEventListener("click", () => {
    config_actual.modo_adjuntos = "requerido";
    guardar_configuracion();
    aplicar_valores_a_ui();
  });

  btn_adjuntos_prohibido.addEventListener("click", () => {
    config_actual.modo_adjuntos = "no_permitido";
    guardar_configuracion();
    aplicar_valores_a_ui();
  });

  // Agregar correo Cc
  btn_agregar_cc.addEventListener("click", () => {
    const texto_input = input_correo_cc.value.trim();
    if (texto_input) {
      // Extrae todos los correos válidos del texto ingresado
      const coincidencias = texto_input.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (coincidencias) {
        let hubo_cambios = false;
        coincidencias.forEach((correo) => {
          const correo_limpio = correo.toLowerCase().trim();
          if (!config_actual.correos_cc.includes(correo_limpio)) {
            config_actual.correos_cc.push(correo_limpio);
            hubo_cambios = true;
          }
        });
        if (hubo_cambios) {
          input_correo_cc.value = "";
          guardar_configuracion();
          renderizar_lista_cc();
        }
      }
    }
  });

  // Agregar palabra clave
  btn_agregar_asunto.addEventListener("click", () => {
    const valor = input_palabra_asunto.value.trim();
    const es_regex = chk_asunto_regex.checked;
    if (valor) {
      const existe = config_actual.palabras_asunto.some(
        (item) => item.valor.toLowerCase() === valor.toLowerCase()
      );
      if (!existe) {
        config_actual.palabras_asunto.push({ valor, es_regex });
        input_palabra_asunto.value = "";
        chk_asunto_regex.checked = false;
        guardar_configuracion();
        renderizar_lista_asunto();
      }
    }
  });

  // Escuchar cambios en el selector de disparador
  select_disparador.addEventListener("change", () => {
    config_actual.disparador = select_disparador.value;
    guardar_configuracion();
    actualizar_estado_validacion();
  });

  // Restablecer valores de fábrica
  btn_restablecer.addEventListener("click", () => {
    obtener_valores_predeterminados((predeterminados) => {
      config_actual = predeterminados;
      if (!config_actual.modo_adjuntos) {
        config_actual.modo_adjuntos = "requerido";
      }
      guardar_configuracion();
      aplicar_valores_a_ui();
    });
  });

  // Consulta el estado de validación a Outlook
  function actualizar_estado_validacion() {
    if (typeof chrome === "undefined" || !chrome.tabs) {
      if (pestana_estado.classList.contains("activa")) {
        seccion_estado.classList.remove("activa");
        pantalla_error.style.display = "block";
      }
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (pestanas) => {
      const pestana_activa = pestanas[0];
      if (!pestana_activa) return;

      chrome.tabs.sendMessage(
        pestana_activa.id,
        { accion: "obtener_estado", config: config_actual },
        (respuesta) => {
          if (chrome.runtime.lastError || !respuesta) {
            if (pestana_estado.classList.contains("activa")) {
              seccion_estado.classList.remove("activa");
              pantalla_error.style.display = "block";
            }
            return;
          }

          if (pestana_estado.classList.contains("activa")) {
            seccion_estado.classList.add("activa");
            pantalla_error.style.display = "none";
          }

          // Validar estado de Cc
          if (!config_actual.validar_cc) {
            circulo_cc.className = "icono-circulo desactivado";
            icono_cc.textContent = "horizontal_rule";
            detalle_cc.textContent = "Validación desactivada";
            btn_corregir_cc.style.display = "none";
          } else if (config_actual.correos_cc.length === 0) {
            circulo_cc.className = "icono-circulo desactivado";
            icono_cc.textContent = "horizontal_rule";
            detalle_cc.textContent = "Sin correos indicados";
            btn_corregir_cc.textContent = "Configurar";
            btn_corregir_cc.style.display = "block";
          } else if (respuesta.cc_correcto) {
            circulo_cc.className = "icono-circulo success";
            icono_cc.textContent = "check";
            detalle_cc.textContent = "Correos en Cc correctos";
            btn_corregir_cc.style.display = "none";
          } else {
            circulo_cc.className = "icono-circulo error";
            icono_cc.textContent = "close";
            detalle_cc.textContent = "Faltan: " + (respuesta.correos_faltantes || []).join(", ");
            btn_corregir_cc.textContent = "Ver Reglas";
            btn_corregir_cc.style.display = "block";
          }

          // Validar estado de Asunto
          if (!config_actual.validar_asunto) {
            circulo_asunto.className = "icono-circulo desactivado";
            icono_asunto.textContent = "horizontal_rule";
            detalle_asunto.textContent = "Validación desactivada";
            btn_ver_reglas.style.display = "none";
          } else if (config_actual.palabras_asunto.length === 0) {
            circulo_asunto.className = "icono-circulo desactivado";
            icono_asunto.textContent = "horizontal_rule";
            detalle_asunto.textContent = "Sin palabras clave";
            btn_ver_reglas.textContent = "Configurar";
            btn_ver_reglas.style.display = "block";
          } else if (respuesta.asunto_correcto) {
            circulo_asunto.className = "icono-circulo success";
            icono_asunto.textContent = "check";
            detalle_asunto.textContent = "Asunto cumple los requisitos";
            btn_ver_reglas.style.display = "none";
          } else {
            circulo_asunto.className = "icono-circulo error";
            icono_asunto.textContent = "close";
            detalle_asunto.textContent = "No cumple los patrones definidos";
            btn_ver_reglas.textContent = "Ver Reglas";
            btn_ver_reglas.style.display = "block";
          }

          // Validar estado de Adjuntos
          if (!config_actual.validar_adjuntos) {
            circulo_adjuntos.className = "icono-circulo desactivado";
            icono_adjuntos.textContent = "horizontal_rule";
            detalle_adjuntos.textContent = "Validación desactivada";
            badge_valido_adjuntos.style.display = "none";
          } else if (respuesta.adjuntos_correcto) {
            circulo_adjuntos.className = "icono-circulo success";
            icono_adjuntos.textContent = "check";
            detalle_adjuntos.textContent = config_actual.modo_adjuntos === "no_permitido"
              ? "No tiene archivos adjuntos"
              : "Tiene archivos adjuntos";
            badge_valido_adjuntos.textContent = "Válido";
            badge_valido_adjuntos.className = "badge-valido";
            badge_valido_adjuntos.style.backgroundColor = "var(--secondary-fixed-dim)";
            badge_valido_adjuntos.style.color = "var(--secondary)";
            badge_valido_adjuntos.style.display = "inline-block";
          } else {
            circulo_adjuntos.className = "icono-circulo error";
            icono_adjuntos.textContent = "close";
            detalle_adjuntos.textContent = config_actual.modo_adjuntos === "no_permitido"
              ? "Tiene archivos adjuntos no permitidos"
              : "Debe contener archivos adjuntos";
            badge_valido_adjuntos.textContent = "Inválido";
            badge_valido_adjuntos.className = "badge-valido";
            badge_valido_adjuntos.style.backgroundColor = "var(--error-container)";
            badge_valido_adjuntos.style.color = "var(--on-error-container)";
            badge_valido_adjuntos.style.display = "inline-block";
          }
        }
      );
    });
  }

  // Inicializacion del popup
  cargar_configuracion();
  iniciar_actualizacion_automatica();
});
