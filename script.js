// Configuración e inicialización de Supabase
const SUPABASE_URL = "https://iqyctvwuucvjjypcnwsl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rKJh1hfNVNfiLsiwWgGL_g_eMWWWJez";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// ==========================================================================
// 1. CAPTURA DE ELEMENTOS DEL DOM (Identificar las piezas en el HTML)
// ==========================================================================

const grupoTema = document.getElementById('grupo-tema');


// ==========================================================================
// 2. VARIABLES DE ESTADO (La memoria temporal del test)
// ==========================================================================
let bancoPreguntasCompleto = []; // Aquí guardaremos TODAS las preguntas de la bd
let preguntasTest = [];
let indicePreguntaActual = 0;
let puntuacion = 0;
let respuestasUsuario = []; // Guardará las respuestas dadas para poder volver atrás

// ==========================================================================
// 3. CARGAR LOS DATOS (Leer el archivo preguntas.json)
// ==========================================================================
function cargarPreguntas() {
    fetch('preguntas.json')
        .then(respuesta => {
            // Convertimos el archivo de texto plano a un formato que JS entienda (Objeto)
            return respuesta.json(); 
        })
        .then(datos => {
            // Guardamos las preguntas en nuestra variable para usarlas cuando queramos
            bancoPreguntasCompleto = datos;
            console.log("¡Datos cargados con éxito! Preguntas encontradas:", bancoPreguntasCompleto.length);
        })
        .catch(error => {
            console.error("Hubo un error al cargar las preguntas:", error);
        });
}

// Ejecutamos la función de carga nada más abrir la página
cargarPreguntas();
// ==========================================================================
// 4. CAPTURA DE NUEVOS ELEMENTOS (Para el inicio del test)
// ==========================================================================
const selectAsignatura = document.getElementById('select-asignatura');
const selectTema = document.getElementById('select-tema');
const btnComenzar = document.getElementById('btn-comenzar');

const pantallaConfig = document.getElementById('pantalla-config');
const pantallaTest = document.getElementById('pantalla-test');

// Variables para controlar el test por dentro
let preguntasFiltradas = []; // Las preguntas que entran en ESTE examen
let tiempoSegundos = 0; // Guardará el total de segundos transcurridos
let idCronometro;       // Guardará el "mando a distancia" para poder parar el reloj
const cronometroElemento = document.getElementById('cronometro'); // Capturamos el <span> del HTML

// Cargar asignaturas activas desde Supabase
async function cargarAsignaturas() {
  const { data: asignaturas, error } = await supabaseClient
    .from('asignaturas')
    .select('*')
    .eq('curso', '1_ESO')
    .order('nombre', { ascending: true });

  if (error) {
    console.error('Error al pedir asignaturas:', error);
    selectAsignatura.innerHTML = '<option value="">Error al cargar datos</option>';
    return;
  }

  selectAsignatura.innerHTML = '<option value="">-- Elige una asignatura --</option>';

  asignaturas.forEach((asig) => {
    const opcion = document.createElement('option');
    opcion.value = asig.id;
    opcion.textContent = asig.nombre;
    selectAsignatura.appendChild(opcion);
  });
}

// Ejecutamos la función al arrancar
cargarAsignaturas();
// Escuchar cuando el usuario cambia de asignatura para cargar sus temas
selectAsignatura.addEventListener('change', async (e) => {
  const asignaturaId = e.target.value;

  // Si deselecciona o vuelve a la opción vacía
  if (!asignaturaId) {
    selectTema.innerHTML = '<option value="">Selecciona una asignatura primero</option>';
    return;
  }

  selectTema.innerHTML = '<option value="">Cargando temas...</option>';

  // Pedimos solo la columna "tema" de las preguntas de esa asignatura
  const { data: preguntas, error } = await supabaseClient
    .from('preguntas')
    .select('tema')
    .eq('asignatura_id', asignaturaId);

  if (error) {
    console.error('Error al cargar temas:', error);
    selectTema.innerHTML = '<option value="">Error al cargar temas</option>';
    return;
  }

  // Extraemos números únicos usando Set y los ordenamos (1, 2, 3...)
  const temasUnicos = [...new Set(preguntas.map((p) => p.tema))].sort((a, b) => a - b);

  selectTema.innerHTML = '<option value="">-- Selecciona un Tema --</option>';

  temasUnicos.forEach((tema) => {
    const opcion = document.createElement('option');
    opcion.value = tema;
    opcion.textContent = `Tema ${tema}`;
    selectTema.appendChild(opcion);
  });
});

// ==========================================================================
// 5. EVENTO CLIC EN "COMENZAR TEST"
// ==========================================================================
btnComenzar.addEventListener('click', async function() {
  const asignaturaElegida = selectAsignatura.value;
  const temaElegido = selectTema.value;

  // 1. Validaciones
  const msgError = document.getElementById('msg-error-config');
  if (msgError) msgError.classList.add('id-oculto');

  if (!asignaturaElegida) {
    if (msgError) {
      msgError.textContent = '⚠️ Por favor, selecciona una asignatura.';
      msgError.classList.remove('id-oculto');
    }
    return;
  }
  if (!temaElegido) {
    if (msgError) {
      msgError.textContent = '⚠️ Por favor, selecciona un tema.';
      msgError.classList.remove('id-oculto');
    }
    return;
  }

  // 2. Feedback visual mientras descarga
  btnComenzar.disabled = true;
  btnComenzar.textContent = 'Cargando preguntas...';

  // 3. Preparar la consulta a Supabase
  let consulta = supabaseClient
    .from('preguntas')
    .select('*')
    .eq('asignatura_id', asignaturaElegida);

  // Si eligió modo tema, añadimos el filtro correspondiente
  consulta = consulta.eq('tema', parseInt(temaElegido));

  const { data: preguntas, error } = await consulta;

  btnComenzar.disabled = false;
  btnComenzar.textContent = 'Comenzar Test';

  if (error || !preguntas || preguntas.length === 0) {
    console.error('Error al cargar preguntas:', error);
    if (msgError) {
      msgError.textContent = '⚠️ No se encontraron preguntas para la selección indicada.';
      msgError.classList.remove('id-oculto');
    }
    return;
  }

  // 4. Barajar las preguntas al azar
  const barajadas = [...preguntas].sort(() => 0.5 - Math.random());

  // 5. Cortar la cantidad según el modo (10 para tema, 40 para examen global)
  const limite = 10;
  preguntasFiltradas = barajadas.slice(0, Math.min(limite, barajadas.length));

  // 6. Resetear variables de control
  indicePreguntaActual = 0;

  // 7. Cambiar de pantalla
  pantallaConfig.classList.add('id-oculto');
  pantallaTest.classList.remove('id-oculto');

  // 8. Pintar la primera pregunta
  iniciarCronometro();
  mostrarPreguntaEnPantalla();
});

// ==========================================================================
// 6. FUNCIÓN PARA FILTRAR LAS PREGUNTAS
// ==========================================================================
function filtrarPreguntas(asignatura, modo, tema) {
    // Usamos .filter() para buscar en todo el almacén de tus 210 preguntas
    preguntasFiltradas = bancoPreguntasCompleto.filter(pregunta => {
        const coincideAsignatura = pregunta.Asignatura === asignatura;
        
        if (modo === "global") {
            return coincideAsignatura; // Si es global, entran todos los temas
        } else {
            // Si es por tema, tiene que coincidir la asignatura Y el número de tema
            return coincideAsignatura && pregunta.Tema == tema;
        }
    });
    // Barajamos todas las preguntas que han pasado el filtro
    preguntasFiltradas = barajarArray(preguntasFiltradas);
    
    // De momento recortamos la lista para cumplir tus reglas (10 para tema, 40 para global)
    // Más adelante programaremos aquí el algoritmo para barajarlas (mezclarlas)
    if (modo === "tema") {
        preguntasFiltradas = preguntasFiltradas.slice(0, 10);
    } else if (modo === "global") {
        preguntasFiltradas = preguntasFiltradas.slice(0, 40);
    }
}
// ==========================================================================
// 7. FUNCIÓN PARA MOSTRAR LA PREGUNTA ACTUAL EN PANTALLA
// ==========================================================================
function mostrarPreguntaEnPantalla() {
    // Limpiamos el feedback visual del clic anterior
    const divFeedback = document.getElementById('feedback');
    const btnSiguiente = document.getElementById('btn-siguiente');
    const btnAnterior = document.getElementById('btn-anterior');
    if (btnAnterior) {
        if (indicePreguntaActual === 0) {
            btnAnterior.classList.add('id-oculto');
        } else {
            btnAnterior.classList.remove('id-oculto');
        }
    }
    divFeedback.classList.add('id-oculto');
    divFeedback.innerHTML = "";
    
    btnSiguiente.textContent = "Saltar / Siguiente Pregunta";

    // Extraemos los datos de la pregunta que toca ahora mismo
    const preguntaActual = preguntasFiltradas[indicePreguntaActual];

    // Actualizamos el contador superior de la pantalla ("Pregunta 1 de 10")
    document.getElementById('progreso-preguntas').textContent = `Pregunta ${indicePreguntaActual + 1} de ${preguntasFiltradas.length}`;

    // Ponemos el enunciado real en el título
    document.getElementById('enunciado').textContent = preguntaActual.enunciado;

    // Capturamos la caja de las opciones y la vaciamos
    const contenedorOpciones = document.getElementById('opciones');
    contenedorOpciones.innerHTML = ""; 

    // Creamos una lista de objetos. Cada opción lleva pegada la información de si es la buena o no.
    let opcionesEstructuradas = [
        { texto: preguntaActual.opcion_0, esCorrecta: preguntaActual.correcta == 0 },
        { texto: preguntaActual.opcion_1, esCorrecta: preguntaActual.correcta == 1 },
        { texto: preguntaActual.opcion_2, esCorrecta: preguntaActual.correcta == 2 },
        { texto: preguntaActual.opcion_3, esCorrecta: preguntaActual.correcta == 3 }
    ];

    // Si la pregunta ya tiene sus opciones barajadas de antes, mantenemos ese orden exacto
    if (!preguntaActual.opcionesGuardadas) {
        preguntaActual.opcionesGuardadas = barajarArray(opcionesEstructuradas);
    }
    let opcionesAMostrar = preguntaActual.opcionesGuardadas;

    // Recorremos los textos y fabricamos un botón HTML real para cada uno
    opcionesAMostrar.forEach((opcion, indiceOpcion) => {
        const boton = document.createElement('button');
        boton.className = 'btn-opcion'; // Le damos la clase CSS para que se vea bonito
        boton.textContent = opcion.texto;

        // Si esta opción es la verdadera, nos guardamos su nueva posición en la pantalla
        if (opcion.esCorrecta) {
            preguntaActual.NUEVO_indiceCorrecto = indiceOpcion;
        }
        // ================================

        // Le asignamos el evento clic a cada respuesta
        boton.addEventListener('click', function() {
            verificarRespuestaUsuario(indiceOpcion);
        });

        contenedorOpciones.appendChild(boton);
    });
    // Si esta pregunta ya había sido respondida previamente, restauramos la vista
    if (respuestasUsuario[indicePreguntaActual] !== undefined) {
        verificarRespuestaUsuario(respuestasUsuario[indicePreguntaActual]);
    }
}

// ==========================================================================
// 8. FUNCIÓN QUE COMPRUEBA LA RESPUESTA SELECCIONADA
// ==========================================================================
let respuestasDelExamen = []; // Aquí guardaremos el historial para el repaso final

function verificarRespuestaUsuario(indiceSeleccionado) {
  // Guardamos la respuesta del alumno para esta pregunta
    respuestasUsuario[indicePreguntaActual] = indiceSeleccionado;
    const preguntaActual = preguntasFiltradas[indicePreguntaActual];
    const divFeedback = document.getElementById('feedback');
    const btnSiguiente = document.getElementById('btn-siguiente');
    // Preparamos el bloque explicativo si la pregunta tiene explicación
    let infoExplicacion = '';
    if (preguntaActual.explicacion) {
        infoExplicacion = `<div class="caja-explicacion">
            <p><strong>💡 Explicación:</strong> ${preguntaActual.explicacion}</p>
            ${preguntaActual.pagina ? `<p class="texto-pagina">📖 Página del libro: ${preguntaActual.pagina}</p>` : ''}
        </div>`;
    }
    
    // Bloqueamos los 4 botones para que el usuario no pueda cambiar de opinión
    const botonesOpciones = document.querySelectorAll('.btn-opcion');
    botonesOpciones.forEach(b => b.disabled = true);

    const indiceCorrecto = preguntaActual.NUEVO_indiceCorrecto;

    divFeedback.classList.remove('id-oculto');
    btnSiguiente.textContent = "Siguiente Pregunta"; 

    // Comparamos el número del botón clicado con el del campo "Correcta" de tu Excel
    if (indiceSeleccionado === indiceCorrecto) {
        divFeedback.innerHTML = "<p class='mensaje-acierto'>¡Correcto! Sigue así.</p>" + infoExplicacion;
        botonesOpciones[indiceSeleccionado].classList.add('opcion-correcta'); // Se vuelve verde
        
        // Guardamos que ha acertado en el historial
        respuestasDelExamen[indicePreguntaActual] = {
            pregunta: preguntaActual,
            estado: "acierto",
            seleccionada: indiceSeleccionado
        };
    } else {
        divFeedback.innerHTML = "<p class='mensaje-fallo'>¡Has fallado!</p>" + infoExplicacion;
        botonesOpciones[indiceSeleccionado].classList.add('opcion-erronea'); // El suyo se vuelve rojo
        botonesOpciones[indiceCorrecto].classList.add('opcion-correcta'); // La solución se vuelve verde
        
        // Guardamos que ha fallado en el historial
        respuestasDelExamen[indicePreguntaActual] = {
            pregunta: preguntaActual,
            estado: "fallo",
            seleccionada: indiceSeleccionado
        };
    }
}
// ==========================================================================
// 9. EVENTO CLIC EN "SIGUIENTE PREGUNTA"
// ==========================================================================
const btnSiguiente = document.getElementById('btn-siguiente');

btnSiguiente.addEventListener('click', function() {
    // Incrementamos el índice para avanzar una posición en el array
    indicePreguntaActual++;

    // Comprobamos si todavía quedan preguntas por responder
    if (indicePreguntaActual < preguntasFiltradas.length) {
        // Si quedan preguntas, pintamos la siguiente
        mostrarPreguntaEnPantalla();
    } else {
        // Si hemos llegado al final, mostramos la pantalla de resultados
        finalizarTest();
    }
});

// ==========================================
// 9.1 CONTROL DEL BOTÓN PREGUNTA ANTERIOR
// ==========================================
const btnAnteriorAccion = document.getElementById('btn-anterior');
if (btnAnteriorAccion) {
    btnAnteriorAccion.addEventListener('click', function() {
        if (indicePreguntaActual > 0) {
            indicePreguntaActual--;
            mostrarPreguntaEnPantalla();
        }
    });
}

// ==========================================================================
// 10. FUNCIÓN PARA FINALIZAR EL TEST Y MOSTRAR RESULTADOS
// ==========================================================================
function finalizarTest() {
    // 1. Apagamos el cronómetro
    clearInterval(idCronometro);

    // 2. Ocultamos la pantalla del test
    pantallaTest.classList.add('id-oculto');
    
    // 3. Mostramos la pantalla de resumen
    const pantallaResumen = document.getElementById('pantalla-resumen');
    pantallaResumen.classList.remove('id-oculto');
    
    // 4. Calculamos los datos del examen
    const aciertos = respuestasDelExamen.filter(r => r && r.estado === "acierto").length;
    const fallos = respuestasDelExamen.filter(r => r && r.estado === "fallo").length;
    const totalPreguntas = preguntasFiltradas.length;
    
    let noContestadas = 0;
    for (let i = 0; i < totalPreguntas; i++) {
        if (!respuestasDelExamen[i]) {
            noContestadas++;
        }
    }

    // Calculamos la nota (sobre 10)
    const nota = ((aciertos / totalPreguntas) * 10).toFixed(2);
    
    // 5. Inyectamos los datos numéricos en tu HTML
    document.getElementById('txt-nota').textContent = nota;
    document.getElementById('txt-aciertos').textContent = aciertos;
    document.getElementById('txt-fallos').textContent = fallos;
    document.getElementById('txt-blancos').textContent = noContestadas;
    const minutos = Math.floor(tiempoSegundos / 60).toString().padStart(2, '0');
    const segundos = (tiempoSegundos % 60).toString().padStart(2, '0');
    const elementoTiempo = document.getElementById('txt-tiempo-total');
    if (elementoTiempo) {
        elementoTiempo.textContent = `${minutos}:${segundos}`;
    }
    guardarEnHistorial(nota, `${minutos}:${segundos}`);
    pintarHistorial();
        

    // ======================================================================
    // MAGIA DEL GRÁFICO CIRCULAR (conic-gradient dinámico)
    // ======================================================================
    // Convertimos los resultados a porcentajes sobre los 360 grados de un círculo
    const gradosAciertos = (aciertos / totalPreguntas) * 360;
    const gradosFallos = (fallos / totalPreguntas) * 360;

    // Calculamos dónde termina cada "quesito" sumando el anterior
    const limiteVerde = gradosAciertos;
    const limiteRojo = limiteVerde + gradosFallos;

    // Capturamos el círculo gris del HTML
    const circuloGrafico = document.getElementById('grafico-circular');

    // Le aplicamos el degradado cónico con tus variables de color reales
    circuloGrafico.style.background = `conic-gradient(
        var(--color-acierto) 0deg ${limiteVerde}deg,
        var(--color-fallo) ${limiteVerde}deg ${limiteRojo}deg,
        #e5e5e5 ${limiteRojo}deg 360deg
    )`;

    // 6. Programamos el botón de reiniciar para volver al menú principal
    document.getElementById('btn-reiniciar').addEventListener('click', function() {
        window.location.reload();
    });
}
// ==========================================================================
// 11. CONTROL DEL CRONÓMETRO (Tiempo del test)
// ==========================================================================
function iniciarCronometro() {
    // Nos aseguramos de resetear el tiempo a cero por si venimos de otro test
    tiempoSegundos = 0;
    clearInterval(idCronometro); 

    // Arrancamos el intervalo para que se ejecute cada 1000 milisegundos (1 segundo)
    idCronometro = setInterval(function() {
        tiempoSegundos++;

        // Calculamos los minutos y los segundos independientes
        let minutos = Math.floor(tiempoSegundos / 60);
        let segundos = tiempoSegundos % 60;

        // Añadimos un cero a la izquierda si el número es menor que 10
        let minutosTexto = minutos < 10 ? "0" + minutos : minutos;
        let segundosTexto = segundos < 10 ? "0" + segundos : segundos;

        // Pintamos el resultado en el HTML
        cronometroElemento.textContent = `${minutosTexto}:${segundosTexto}`;
    }, 1000);
}
// ==========================================================================
// 12. ALGORITMO DE BARAJADO (Fisher-Yates)
// ==========================================================================
function barajarArray(array) {
    // Recorremos el array desde el final hasta el principio
    for (let i = array.length - 1; i > 0; i--) {
        // Elegimos un índice aleatorio entre 0 e i
        const j = Math.floor(Math.random() * (i + 1));
        // Intercambiamos los elementos de la posición i y j
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
// ==========================================
// 13. HISTORIAL EN LOCALSTORAGE
// ==========================================

function guardarEnHistorial(nota, tiempoTexto) {
  const nombreAsignatura = selectAsignatura.options[selectAsignatura.selectedIndex]?.text || 'General';
  const temaTexto = selectTema.value ? `Tema ${selectTema.value}` : 'Todos';

  const ahora = new Date();
  const dia = String(ahora.getDate()).padStart(2, '0');
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const horas = String(ahora.getHours()).padStart(2, '0');
  const minutos = String(ahora.getMinutes()).padStart(2, '0');
  const fecha = `${dia}/${mes} ${horas}:${minutos}`;

  const nuevoRegistro = {
    fecha: fecha,
    asignatura: nombreAsignatura,
    tema: temaTexto,
    nota: nota,
    tiempo: tiempoTexto
  };

  const historial = JSON.parse(localStorage.getItem('historial_tests')) || [];
  historial.unshift(nuevoRegistro);
  localStorage.setItem('historial_tests', JSON.stringify(historial.slice(0, 10)));
}

function pintarHistorial() {
  const tbody = document.getElementById('cuerpo-historial');
  if (!tbody) return;

  const historial = JSON.parse(localStorage.getItem('historial_tests')) || [];

  if (historial.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="color: #888; text-align: center;">Sin intentos registrados aún</td></tr>';
    return;
  }

  tbody.innerHTML = historial.map(item => `
    <tr>
      <td>${item.fecha}</td>
      <td>${item.asignatura || '-'}</td>
      <td>${item.tema || item.tipo || '-'}</td>
      <td><strong>${item.nota}</strong></td>
      <td>${item.tiempo}</td>
    </tr>
  `).join('');
}