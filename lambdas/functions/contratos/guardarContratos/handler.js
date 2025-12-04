const { response, logMensaje, ejecutarQuery, LogError } = require("utils");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const client = new S3Client({});

exports.guardarContratos = async (event) => {
   console.log(logMensaje("event", event));
   response.statusCode = 200;
   const bucket = event.detail.bucket.name;
   const key = event.detail.object.key;
   const params = {
      Bucket: bucket,
      Key: key,
   };
   try {
      const promesas = [];
      const command = new GetObjectCommand(params);
      const respuesta = await client.send(command);
      const stream = respuesta.Body;
      const buff = Buffer.concat(await stream.toArray());
      const data = JSON.parse(buff.toString());
      const query = `INSERT INTO TablaAnunciosComprasMx (FechaJuntaAclaraciones,FechaPresentacionAperturaProposiciones, created_at, updated_at, NoLicitacion, NombreUnidadCompradora, ReferenciaExpendiente, DescripcionAnuncio, TipoContratacion, TipoExpediente, es_de_TI, razon, clasificacion) VALUES (  STR_TO_DATE(:FechaJuntaAclaraciones, '%d/%m/%Y %H:%i'),  STR_TO_DATE(:FechaPresentacionAperturaProposiciones, '%d/%m/%Y %H:%i'), DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 HOUR), DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 HOUR), :NoLicitacion, :NombreUnidadCompradora, :ReferenciaExpendiente, :DescripcionAnuncio, :TipoContratacion, :TipoExpediente, :es_de_TI, :razon, :clasificacion) ON DUPLICATE KEY UPDATE  FechaJuntaAclaraciones = STR_TO_DATE(:FechaJuntaAclaraciones, '%d/%m/%Y %H:%i'), FechaPresentacionAperturaProposiciones = STR_TO_DATE(:FechaPresentacionAperturaProposiciones, '%d/%m/%Y %H:%i'), updated_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 HOUR), NombreUnidadCompradora = :NombreUnidadCompradora,  ReferenciaExpendiente = :ReferenciaExpendiente,  DescripcionAnuncio = :DescripcionAnuncio,  TipoContratacion = :TipoContratacion,  TipoExpediente = :TipoExpediente,  es_de_TI = :es_de_TI,  razon = :razon,  clasificacion = :clasificacion;`
      const queryIDs = `SELECT id, NoLicitacion FROM TablaAnunciosComprasMx WHERE NoLicitacion in (:listaLicitaciones);`
      const queryRequerimientos = `INSERT IGNORE INTO TablaRequerimientosComprasMx (compras_id, seccion, numero, partida_especifica, clave_cucop, descripcion_cucop, descripcion, medida, cantidad, minimo, maximo) VALUES  (:compras_id, :seccion, :numero, :partida_especifica, :clave_cucop, :descripcion_cucop, :descripcion, :medida, :cantidad, :minimo, :maximo);`
      const listaLicitaciones = [];
      const guardarPartidas = [];
      try {
         for (const registro of data) {
            promesas.push(ejecutarQuery(query, registro, "INSERT"));
            if (registro.es_de_TI === "verdadero" || (registro.es_de_TI === "falso" && registro.razon !== "Las partidas especificas de los requerimientos economicos no corresponden a TI")) {
               guardarPartidas.push(registro);
               listaLicitaciones.push(registro.NoLicitacion);
            }
         }
      } catch (error) {
         /** LogError(funcion, error, datos)
       * funcion: Nombre de la funcion donde ocurre el error
       * error: Objeto error capturado
       * datos: Datos relevantes al contexto del error
       */
         console.error(LogError("Registro de licitaciones info general", error, event));
         console.log("error", error);
         response.statusCode = 500;
         response.body = error.toString();
         return response;
      }
      promesas.length = 0;
      try {
         const idsResult = await ejecutarQuery(queryIDs, { listaLicitaciones });
         for (const registro of guardarPartidas) {
            const encontrado = idsResult.find(r => r.NoLicitacion == registro.NoLicitacion);
            if (encontrado) {
               const compras_id = encontrado.id;
               for (const keys of Object.keys(registro.listaPartidas)) {
                  for (const [index, partida] of registro.listaPartidas[keys].entries()) {
                     const datos = {
                        compras_id: compras_id,
                        seccion: keys ? keys.length > 197 ? keys.slice(0, 197) + "..." : keys : "Requerimiento 1",
                        numero: partida?.["Núm."] || index + 1,
                        partida_especifica: partida["Partida específica"],
                        clave_cucop: partida["Clave CUCoP+"],
                        descripcion_cucop: partida["Descripción CUCoP+"],
                        descripcion: partida["Descripción detallada"],
                        medida: partida?.["Unidad de medida"] || null,
                        cantidad: partida?.["Cantidad solicitada"] || null,
                        minimo: partida?.["Cantidad mínima"] || null,
                        maximo: partida?.["Cantidad máxima"] || null,
                     };
                     promesas.push(ejecutarQuery(queryRequerimientos, datos, "INSERT"));
                  }
               }
               await Promise.all(promesas);
               promesas.length = 0;
            } else {
               console.log(logMensaje("No se encontró el ID para la licitación:", registro));
               console.log(logMensaje("encontrado", encontrado));
               console.log(logMensaje("registro.NoLicitacion", registro.NoLicitacion));
               throw new Error("No se encontró el ID para la licitación");
            }
         }
      } catch (error) {
         /** LogError(funcion, error, datos)
          * funcion: Nombre de la funcion donde ocurre el error
          * error: Objeto error capturado
          * datos: Datos relevantes al contexto del error
          */
         console.error(LogError("Registro de requerimientos economicos", error, event));
         console.log("error", error);
         response.statusCode = 500;
         response.body = error.toString();
         return response;
      }
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

