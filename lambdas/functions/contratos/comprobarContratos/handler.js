const { response, logMensaje, LogError } = require("utils");
const { ConsultarModelo } = require("modelos-bedrock");
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const client = new S3Client({});
/*const instruccionIA = `Eres un analista de datos experto en temas de Tecnologías de la Información (TI).
Su tarea es analizar licitaciones de diferentes rubros, debes de reconocer si los contratos son de Tecnologías de la Información (TI).
Si están relacionados en temas como computo, impresión, soporte técnico de tecnología, telecomunicaciones, software, suscripción, nube, seguridad de la información, telefonía, cómputo, ciberseguridad, tóner, bienes informáticos, servicios virtualizados, cloud, equipo de telecomunicaciones.
Tienes que clasificar cada licitación que este relacionado con temas de Tecnologías de la Información (TI) con las siguientes clasificaciones:
- Equipo: Se refiere a equipos de cómputo, equipo médico no entran en esta clasificación.
- Nube: se refiere a nube publica, privada o hibrida.
- Servicios: se refiere a servicios relacionados a TI.
- Software: se refiere a software relacionado a TI.
- Telecom: se refiere a telecomunicaciones relacionado a TI.
- NA: en caso de que la licitación no esté relacionado a TI.
Responde únicamente en formato JSON con esta estructura exacta:
{
  "analisis": {
    "es_de_TI": "verdadero/falso",
    "razon": "razón por la que lo clasificas como que es de TI o no es de TI",
    "clasificacion": "Equipo/Nube/Servicios/Software/Telecom/NA"
  }
}
Si el contrato habla sobre Tecnologías de la Información (TI), ejemplo de respuesta esperada:
{
  "analisis": {
    "es_de_TI": "verdadero",
    "razon": "El contrato habla sobre temas de ciberseguridad",
    "clasificacion": "Servicios"
  }
}
En caso de que no tengas suficiente información sobre el contrato, responder con el siguiente formato JSON:
{
  "analisis": {
    "es_de_TI": "falso",
    "razon": "NA",
    "clasificacion": "NA"
  }
}
Instrucciones:
- Responde solo en formato JSON válido
- No incluyas explicaciones fuera del JSON.`*/

const instruccionIA = `Eres un analista de datos experto en temas de Tecnologías de la Información (TI).

TAREA:
Analiza licitaciones y determina si están relacionadas con Tecnologías de la Información (TI).

CRITERIOS DE TI:
Temas relacionados: cómputo, impresión, soporte técnico de tecnología, telecomunicaciones, software, suscripción, nube, seguridad de la información, telefonía, ciberseguridad, tóner, bienes informáticos, servicios virtualizados, cloud, equipo de telecomunicaciones.

CLASIFICACIONES VÁLIDAS:
- "Equipo": Equipos de cómputo (NO equipo médico)
- "Nube": Nube pública, privada o híbrida
- "Servicios": Servicios relacionados a TI
- "Software": Software relacionado a TI
- "Telecom": Telecomunicaciones relacionadas a TI
- "NA": NO está relacionado con TI

FORMATO DE SALIDA OBLIGATORIO:
Debes responder ÚNICAMENTE con un objeto JSON válido siguiendo EXACTAMENTE esta estructura:

{
  "analisis": {
    "es_de_TI": "verdadero o falso",
    "razon": "explicación breve de tu decisión",
    "clasificacion": "Equipo o Nube o Servicios o Software o Telecom o NA"
  }
}

REGLAS ESTRICTAS:
1. NO incluyas texto antes o después del JSON
2. NO uses markdown, backticks o código
3. El campo "es_de_TI" solo puede ser "verdadero" o "falso" (en minúsculas)
4. El campo "clasificacion" debe ser exactamente uno de: Equipo, Nube, Servicios, Software, Telecom, NA
5. Si no hay información suficiente, usa: {"analisis": {"es_de_TI": "falso", "razon": "NA", "clasificacion": "NA"}}

EJEMPLOS:

Entrada: "Contrato para servicios de ciberseguridad"
Salida:
{"analisis": {"es_de_TI": "verdadero", "razon": "El contrato habla sobre temas de ciberseguridad", "clasificacion": "Servicios"}}

Entrada: "Adquisición de computadoras portátiles"
Salida:
{"analisis": {"es_de_TI": "verdadero", "razon": "Se refiere a equipos de cómputo", "clasificacion": "Equipo"}}

Entrada: "Compra de material médico quirúrgico"
Salida:
{"analisis": {"es_de_TI": "falso", "razon": "Material médico no relacionado con TI", "clasificacion": "NA"}}

Ahora analiza la siguiente licitación y responde SOLO con el JSON:`;


exports.comprobarContratos = async (event) => {
   console.log(logMensaje("event", event));
   response.statusCode = 200;
   const bucket = event.detail.bucket.name;
   const key = event.detail.object.key;
   const ruta = event.detail.object.key.split("/");
   const fileName = ruta[ruta.length - 1];
   const params = {
      Bucket: bucket,
      Key: key,
   };
   const modelo = "amazon-lite";
   try {
      const resp = [];

      const command = new GetObjectCommand(params);
      const respuesta = await client.send(command);
      const stream = respuesta.Body;
      const buff = Buffer.concat(await stream.toArray());
      const data = JSON.parse(buff.toString());
      if (data.length > 0) {
         for (const [index, licitacion] of data.entries()) {
            const tablaComprasMX = {
               "NoLicitacion": licitacion["Número de identificación"],
               "NombreUnidadCompradora": null,
               "ReferenciaExpendiente": licitacion["URL"],
               "DescripcionAnuncio": null,
               "TipoContratacion": null,
               "TipoExpediente": null,
               "FechaJuntaAclaraciones": licitacion["Fecha junta de aclaraciones"] || null,
               "FechaPresentacionAperturaProposiciones": null,
               "es_de_TI": null,
               "razon": null,
               "clasificacion": null,
               "listaPartidas": null,
               "created_at": null
            }
            if (licitacion["detalles"].hasOwnProperty("error")) {
               tablaComprasMX.es_de_TI = "manual";
               tablaComprasMX.razon = "No se pudo obtener toda la información de la licitación por problemas en el sitio; verificar de forma manual.";
               tablaComprasMX.clasificacion = "NA";
               resp.push(tablaComprasMX);
            } else {
               tablaComprasMX.NombreUnidadCompradora = licitacion["detalles"]["DATOS DEL ENTE CONTRATANTE"]["Dependencia o Entidad"] || null;
               tablaComprasMX.DescripcionAnuncio = licitacion["detalles"]["DATOS GENERALES"]["Descripción detallada del procedimiento de contratación"] || null;
               tablaComprasMX.TipoContratacion = licitacion["detalles"]["DATOS ESPECÍFICOS"]["Tipo de contratación"] || null;
               tablaComprasMX.TipoExpediente = licitacion["detalles"]["DATOS GENERALES"]["Tipo de procedimiento de contratación"] || null;
               tablaComprasMX.FechaPresentacionAperturaProposiciones = licitacion["detalles"]["CRONOGRAMA DE EVENTOS"]["Fecha y hora de presentación y apertura de proposiciones"] || null;
               tablaComprasMX.created_at = licitacion["detalles"]["CRONOGRAMA DE EVENTOS"]["Fecha y hora de publicación"] || null;
               const comprobar = comprobarPartida(licitacion["detalles"]["Requerimientos"], licitacion);
               if (comprobar.es_de_TI) {
                  const peticion = `${tablaComprasMX.DescripcionAnuncio}.\nLa licitación anterior tiene los siguientes requerimientos económicos:\n${comprobar.lista_partidas}`;
                  const comprobarConIA = await comprobarIA(modelo, instruccionIA, peticion);
                  tablaComprasMX.es_de_TI = comprobarConIA.es_de_TI;
                  tablaComprasMX.razon = comprobarConIA.razon;
                  tablaComprasMX.clasificacion = comprobarConIA.clasificacion;
                  tablaComprasMX.listaPartidas = licitacion["detalles"]["Requerimientos"];
               } else if (comprobar.es_mixto) {
                  tablaComprasMX.es_de_TI = "mixto";
                  tablaComprasMX.razon = "Tiene algunos requerimientos economicos relacionados con TI";
                  tablaComprasMX.clasificacion = "NA";
                  tablaComprasMX.listaPartidas = licitacion["detalles"]["Requerimientos"];
               }
               else {
                  tablaComprasMX.es_de_TI = "falso";
                  tablaComprasMX.razon = "Las partidas especificas de los requerimientos economicos no corresponden a TI";
                  tablaComprasMX.clasificacion = "NA";
               }
               resp.push(tablaComprasMX);
            }
         }
      }
      //const fecha = obtenerFechaAyer();
      //const fecha = "2025-10-08";
      const guardar = new PutObjectCommand({
         Bucket: process.env.BUCKETNAME,
         Key: process.env.CARPETA + "/" + modelo + "_" + fileName,
         Body: JSON.stringify(resp),
      });
      const respuestaGuardar = await client.send(guardar);
      console.log(respuestaGuardar);
      response.body = "Completado";
      return response
   } catch (error) {
      /** LogError(funcion, error, datos)
       * funcion: Nombre de la funcion donde ocurre el error
       * error: Objeto error capturado
       * datos: Datos relevantes al contexto del error
       */
      console.error(LogError("main", error, event));
      console.log("error", error);
      response.statusCode = 500;
      response.body = error.toString();
      return response;
   }
};


/*function obtenerFechaAyer() {
   const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
   });
   const fechaAyer = formatter.format(new Date(new Date().setDate(new Date().getDate() - 1)));
   return fechaAyer;
}*/

async function comprobarIA(modelo, promptSystem, promptUser) {
   return new Promise(async (resolve, reject) => {
      try {
         const peticion = await ConsultarModelo(modelo, promptSystem, promptUser)
         const analisis = JSON.parse(peticion).analisis;
         resolve(analisis);
      } catch (error) {
         /** LogError(funcion, error, datos)
       * funcion: Nombre de la funcion donde ocurre el error
       * error: Objeto error capturado
       * datos: Datos relevantes al contexto del error
       */
         console.error(LogError("comprobarIA", error, { modelo, promptSystem, promptUser }));
         resolve({
            "es_de_TI": "falso",
            "razon": "NA",
            "clasificacion": "NA"
         })
      }
   })

}


function comprobarPartida(requerimientos, licitacion) {
   try {
      const decisiones = [];
      const claves = [];
      const partidasTIC = {
         "es_de_TI": false,
         "es_mixto": false,
         "lista_partidas": null
      }
      const partidasEspecificas = {
         "21401": {
            "descripcion": "Materiales y útiles consumibles para el procesamiento en equipos y bienes informáticos",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a la adquisición de insumos y equipos menores utilizados en el procesamiento, grabación e impresión de datos, así como los materiales para la limpieza y protección de los equipos, tales como: medios ópticos y magnéticos, apuntadores, protectores, cintas magnéticas, CD'S y DVD'S para grabar información, fundas, solventes, membrana cubre-teclado, cartuchos de tóner para impresora y plotter, tambores para impresoras, etiquetas especiales para impresión y papel STK, kit para impresoras y multifuncionales (kit de fusor, kit de transferencia de imágenes), cartuchos de tinta; materiales para la impresión de credenciales como plásticos, cintas de laminación y rodillos de limpieza, entre otros.",
            "tipo": "Equipo"
         },
         "24601": {
            "descripcion": "Material eléctrico y electrónico",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a la adquisición de todo tipo de material eléctrico y electrónico, tales como: cables, interruptores, tubos fluorescentes, focos, aislantes, electrodos, transistores, alambres, lámparas, entre otros, que requieran las líneas de transmisión telefónica, eléctrica y de telecomunicaciones sean aéreas o subterráneas, balastras, conductos, chalupas, contactos, apagadores, tapas para apagador, switch, lámparas de mano, arrancadores termomagnéticos, fusibles, pilas, pastilla trifásica, extensiones y clavijas, cintas aislantes, conectores eléctricos y electrónicos, componentes electrónicos como tarjetas simples y cargadas; circuitos, entre otros bienes; siempre y cuando su costo unitario no rebase de las 70 UMAS.",
            "tipo": "Equipo"
         },
         "29401": {
            "descripcion": "Refacciones y accesorios para equipo de cómputo y telecomunicaciones",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a la adquisición de componentes o dispositivos internos o externos que se integran al equipo de cómputo y telecomunicaciones, con el objeto de conservar o recuperar su funcionalidad y que son de difícil control de inventarios, tales como: tarjetas electrónicas (módem, red, controladora de memoria y de sonido), unidades de discos duros internos, drives, mouse, circuitos, baterías para computadora, teclados, bocinas, unidad lectora y/o grabadora de disco compacto (CD, DVD o Blue Ray), cámaras, memorias (SIMM) y USB, cables USB y HDMI, VGA, SD, accesorios para teléfono celular o radiocomunicación (cargador, cargador de automóvil, chips, baterías), control remoto y HUBS, cables de alimentación para computadora e impresora, base enfriadora para Lap-Top, entre otros bienes; siempre y cuando su costo unitario no rebase de las 70 UMAS.",
            "tipo": "Equipo"
         },
         "31401": {
            "descripcion": "Servicio telefónico convencional",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas al pago de servicio telefónico convencional nacional e internacional, mediante redes alámbricas, incluido el servicio de fax, requerido en el desempeño de funciones oficiales.",
            "tipo": "Telecom"
         },
         "31501": {
            "descripcion": "Servicio de telefonía celular",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas al pago de servicios de telefonía celular, incluidas tarjetas de prepago (celular y satelital), requerido en el desempeño de funciones oficiales.",
            "tipo": "Telecom"
         },
         "31601": {
            "descripcion": "Servicio de radiolocalización",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas al pago de servicios de radiolocalización, requeridos en el desempeño de funciones oficiales, tal como: comunicación por radio, entre otros.",
            "tipo": "Telecom"
         },
         "31602": {
            "descripcion": "Servicios de telecomunicaciones",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el pago de servicios de la red de telecomunicaciones nacional e internacional, requeridos en el desempeño de funciones oficiales, con excepción de la partida 31901 Servicios Integrales de Telecomunicación.",
            "tipo": "Telecom"
         },
         "31603": {
            "descripcion": "Servicios de internet",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el pago de servicios de Internet, requeridos en el desempeño de funciones oficiales.",
            "tipo": "Telecom"
         },
         "31701": {
            "descripcion": "Servicio de conducción de señales analógicas y digitales",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el pago de servicios de la red de telecomunicaciones nacional e internacional, requeridos en el desempeño de funciones oficiales. Incluye la radiolocalización unidireccional o sistema de comunicación personal y selectiva de alerta, sin mensaje, o con un mensaje definido compuesto por caracteres numéricos o alfanuméricos. Incluye servicios de conducción de señales de voz, datos e imagen requeridos en el desempeño de funciones oficiales, tales como: servicios satelitales, red digital integrada y demás servicios no consideradas en las redes telefónicas y de telecomunicaciones nacional e internacional.",
            "tipo": "Telecom"
         },
         "31901": {
            "descripcion": "Servicios integrales de telecomunicación",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el pago de servicios integrales en materia de telecomunicaciones requeridos en el desempeño de funciones oficiales, tales como: telefonía celular, radiocomunicación y radiolocalización, entre otros, cuando no sea posible su desagregación en las demás partidas de este concepto. No incluye los servicios integrales de cómputo ni servicios de informática.",
            "tipo": "Telecom"
         },
         "31904": {
            "descripcion": "Servicios integrales de infraestructura de cómputo",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir los servicios de centros de datos principales y/o alternos incluyendo: hospedaje de páginas web, mantenimiento a las instalaciones físicas tales como eléctricas, contra incendio, de video-vigilancia y monitoreo; mantenimiento a equipos de aire acondicionado, jaulas, así como a los servidores físicos y/o virtuales ubicados en centros de datos, esquemas y equipos de almacenamiento y respaldo de información, y equipos de energía ininterrumpida (UPS) en centros de datos, red local, y administración de aplicaciones, y otros servicios relacionados.",
            "tipo": "Servicios TIC"
         },
         "32301": {
            "descripcion": "Arrendamiento de equipo y bienes informáticos",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el alquiler de toda clase de mobiliario requerido en el cumplimiento de las funciones oficiales. Incluye bienes y equipos de tecnologías de la información, tales como: equipo de cómputo e impresoras, entre otras, excluye los gastos descritos en las partidas 31901 Servicios Integrales de Telecomunicación y 31602 Servicios de Telecomunicaciones.",
            "tipo": "Equipo"
         },
         "32303": {
            "descripcion": "Arrendamiento de equipo de telecomunicaciones",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el alquiler de toda clase de equipo de telecomunicaciones, excluye los gastos descritos en las partidas 31901 Servicios Integrales de Telecomunicación y 31602 Servicio de Telecomunicaciones.",
            "tipo": "Equipo"
         },
         "32701": {
            "descripcion": "Patentes, derechos de autor, regalías y otros",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el importe que corresponda por el uso de patentes y marcas, representaciones comerciales e industriales, regalías por derechos de autor, membresías, servicios de información en línea, así como licencias de uso de programas de cómputo y su actualización y/o mantenimiento; se incluyen las tarjetas de membresía o prestación de servicio electrónico bajo licencia (apps).",
            "tipo": "Servicios TIC"
         },
         "33104": {
            "descripcion": "Otras asesorias para la operacion de programas",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el costo de servicios profesionales, que se contraten con personas físicas y morales por concepto de asesoramiento y consulta, asistencia e intercambio, en cumplimiento de la función pública, en materia jurídica, económica, contable, entre otras, requeridas para la operación de programas y proyectos de las dependencias y entidades, cuando los servicios requeridos no correspondan con las demás partidas del concepto 3300 Servicios profesionales, científicos, técnicos y otros servicios.",
            "tipo": "Servicios TIC"
         },
         "33301": {
            "descripcion": "Servicios de desarrollo de aplicaciones informáticas",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el costo de los servicios profesionales que se contraten con personas físicas y morales para el desarrollo de sistemas, sitios o páginas de Internet, procesamiento y elaboración de programas, ploteo por computadora, reproducción de información en medios magnéticos, servicios en el campo de las tecnologías de información a través de actividades como planeación y diseño de sistemas de cómputo que integran hardware y software y tecnologías de comunicación, asesoría en la instalación de equipo y redes informáticas, administración de centros de cómputo y servicios de instalación de software, consultoría especializada en tecnologías de la información. Incluye planeación, diseño y desarrollo de programas computacionales, distintos de los contratados mediante licencia de uso previstos en la partida 32701 Patentes, Derechos de Autor, Regalías y Otros.",
            "tipo": "Servicios TIC"
         },
         "33304": {
            "descripcion": "Servicios de mantenimiento de aplicaciones informáticas",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el costo de los servicios profesionales que se contraten con personas físicas y morales para el mantenimiento de sitios y/o páginas web, así como el mantenimiento y soporte a los sistemas y programas ya existentes, distintos de los contratados mediante licencia de uso previstos en la partida 32701 Patentes, Derechos de Autor, Regalías y Otros.",
            "tipo": "Servicios TIC"
         },
         "33401": {
            "descripcion": "Servicios para capacitación a servidores públicos",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el costo de los servicios profesionales que se contraten con personas físicas y morales por concepto de preparación e impartición de cursos de capacitación, talleres, seminarios y diplomados de los servidores públicos, en cumplimiento de los programas anuales de capacitación que establezca la Suprema Corte. Excluye las erogaciones por apoyos a la capacitación comprendidas en la partida 15501 Apoyos a la capacitación de los servidores públicos.",
            "tipo": "Servicios TIC"
         },
         "33606": {
            "descripcion": "Servicios de digitalización",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el pago de servicios de digitalización, incluyendo la preparación de los documentos físicos, su escaneo, clasificación y captura en sistemas de cómputo.",
            "tipo": "Servicios TIC"
         },
         "35101": {
            "descripcion": "Mantenimiento y conservación de inmuebles",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir los gastos por servicios de conservación y mantenimiento menor de edificios, locales, terrenos, predios, áreas verdes y caminos de acceso, propiedad o al servicio de la Suprema Corte, cuando se efectúen por cuenta de terceros, tales como: reparación de chapas para puertas, impermeabilizaciones, instalaciones eléctricas, señalamientos, compra y arreglo de plantas y macetones, pintura de locales, arreglo de sanitarios, pulido y brillado de pisos, cambio de ubicación de aparatos telefónicos, elevadores, montacargas, plantas de emergencia, cableado de datos (Red), instalaciones hidrosanitarias y subestaciones eléctricas, entre otros, incluido el pago de deducibles de seguros. Así como la ampliación, remodelación, mantenimiento o reparación integral de las construcciones, y la contratación de servicios relacionados con la obra pública en inmuebles que no son propiedad de la Suprema Corte de Justicia de la Nación. Excluye las erogaciones relacionadas con obras públicas del capítulo 6000 Inversión Pública.",
            "tipo": "Servicios TIC"
         },
         "35301": {
            "descripcion": "Mantenimiento y conservación de bienes informáticos",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir los gastos por servicios que se contraten con terceros para la instalación, reparación y mantenimiento de equipos de cómputo y tecnologías de la información, tales como: computadoras, impresoras, dispositivos de seguridad, discos duros, reguladores, fuentes de potencia ininterrumpida, entre otros, incluye el pago de deducibles de seguros.",
            "tipo": "Servicios TIC"
         },
         "35601": {
            "descripcion": "Reparacion y mantenimiento de equipo de defensa y seguridad",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir los gastos por servicios de reparación y mantenimiento del equipo de defensa y seguridad.",
            "tipo": "Servicios TIC"
         },
         "36901": {
            "descripcion": "Servicios relacionados con monitoreo de información en medios masivos",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a cubrir el costo de la contratación de servicios profesionales con personas físicas o morales, por concepto de monitoreo de información en medios masivos de comunicación, de las actividades del quehacer de la Suprema Corte.",
            "tipo": "Servicios TIC"
         },
         "51501": {
            "descripcion": "Bienes informáticos",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a la adquisición de equipos y aparatos de uso informático, para el procesamiento electrónico de datos y para el uso de redes, tales como: servidores, computadoras, lectoras, terminales, procesadores, tableros de control, equipos de conectividad, unidades de almacenamiento, discos duros externos, impresoras, lectores ópticos y magnéticos, monitores, módem para computadora, fax, teléfono, multifuncional, equipo de videoconferencias, agenda electrónica, entre otros. Sin incluir los “equipos y aparatos de comunicaciones y telecomunicaciones” señalados en la partida 56501; siempre y cuando su costo unitario rebase de las 70 UMAS.",
            "tipo": "Equipo"
         },
         "56501": {
            "descripcion": "Equipos y aparatos de comunicaciones y telecomunicaciones",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a la adquisición de equipos y aparatos de comunicaciones y telecomunicaciones, tales como: comunicación satelital, microondas, transmisores, receptores, equipos de télex, de video comunicación, amplificadores de señal, equipos telefónicos, de fax, distribuidores de audio y video, equipos de radiocomunicación y demás equipos y aparatos para el mismo fin; siempre y cuando su costo unitario rebase de las 70 UMAS. Sin incluir los bienes informáticos a que se refiere la partida 51501 Bienes informáticos.",
            "tipo": "Equipo"
         },
         "59101": {
            "descripcion": "Software",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas para la adquisición de paquetes y programas de informática, para ser aplicados en los sistemas administrativos y operativos computarizados de la Suprema Corte; siempre y cuando su costo unitario rebase de las 70 UMAS.",
            "tipo": "Software"
         },
         "59700": {
            "descripcion": "Licencias informáticas e intelectuales (Ramos Autónomos)",
            "es_de_TI": true,
            "texto": "LICENCIAS INFORMÁTICAS E INTELECTUALES",
            "tipo": "Software"
         },
         "59701": {
            "descripcion": "Licencias informáticas e intelectuales (Ramos Autónomos)",
            "es_de_TI": true,
            "texto": "Licencias informáticas e intelectuales (Ramos Autónomos)",
            "tipo": "Software"
         },
         "62905": {
            "descripcion": "Otros servicios relacionados con obras públicas",
            "es_de_TI": true,
            "texto": "Asignaciones destinadas a la contratación de servicios relacionados con la obra pública, como son: diseños arquitectónicos, artísticos y de ingeniería industrial y electromecánica, mecánica de suelos, topografía, resistencia de materiales, trabajos de organización, informática y sistemas; arrendamientos relacionados con equipos para la construcción o demolición de edificios u obras de ingeniería civil, estudios de pre-inversión y demás servicios relacionados con las obras públicas en los inmuebles propiedad de la Suprema Corte de Justicia de la Nación. Excluye los servicios relacionados con obra pública que se realicen de manera periódica o extraordinaria y que no estén vinculados directamente a la ejecución de obra pública que incremente el valor de los edificios propiedad de la Suprema Corte de Justicia de la Nación.",
            "tipo": "Servicios TIC"
         }
      }
      let extra = 0;
      let hayTI = false;
      let extraNoTI = false;
      for (const key of Object.keys(requerimientos)) {
         for (const requisito of requerimientos[key]) {
            const partida = requisito["Partida específica"];
            const es_de_TI = partidasEspecificas[partida];
            if (es_de_TI) {
               if (!claves.includes(requisito["Clave CUCoP+"]) && ((claves.length < 3 && extra === 0) || (claves.length <= 3 && extra === 1))) {
                  claves.push(requisito["Clave CUCoP+"]);
                  partidasTIC.es_de_TI = true;
                  hayTI = true;
                  decisiones.push(acortarTexto(requisito["Descripción detallada"], 250));
               }
            } else {
               extraNoTI = true;
               if (extra < 1) {
                  claves.push(requisito["Clave CUCoP+"]);
                  decisiones.push(acortarTexto(requisito["Descripción detallada"], 250));
                  extra = 1;
               }
            }
         }
      }
      if (hayTI && !extraNoTI) {
         const texto = decisiones.slice(0, 4).map((item, i) => {
            return `${i + 1}. ${item}.`;
         })
         partidasTIC.lista_partidas = texto.join("\n");
         console.log("partidasTIC", partidasTIC);
      }
      if (hayTI && extraNoTI) {
         partidasTIC.es_mixto = true;
         partidasTIC.es_de_TI = false;
      }
      return partidasTIC;
   } catch (error) {
      console.error(LogError("ComprobarPartida", error, { requerimientos, licitacion }));
      throw new Error(error);
   }
}

function acortarTexto(texto, longitudMinima = 100) {
   if (texto.length <= longitudMinima) return texto;
   let fragmento = texto.slice(0, longitudMinima);
   const ultimoEspacio = fragmento.lastIndexOf(" ");
   if (ultimoEspacio > -1) {
      fragmento = fragmento.slice(0, ultimoEspacio);
   }
   return fragmento.trim() + "...";
}