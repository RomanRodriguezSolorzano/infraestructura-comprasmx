const { response, logMensaje, ejecutarQuery } = require("utils");
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
      const query = `INSERT INTO TablaAnunciosComprasMx (FechaJuntaAclaraciones,FechaPresentacionAperturaProposiciones, created_at, updated_at, NoLicitacion, NombreUnidadCompradora, ReferenciaExpendiente, DescripcionAnuncio, TipoContratacion, TipoExpediente, es_de_TI, razon, clasificacion) VALUES (  STR_TO_DATE(:FechaJuntaAclaraciones, '%d/%m/%Y %H:%i'),  STR_TO_DATE(:FechaPresentacionAperturaProposiciones, '%d/%m/%Y %H:%i'), DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 HOUR), DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 HOUR), :NoLicitacion, :NombreUnidadCompradora, :ReferenciaExpendiente, :DescripcionAnuncio, :TipoContratacion, :TipoExpediente, :es_de_TI, :razon, :clasificacion)  ON DUPLICATE KEY UPDATE  FechaJuntaAclaraciones = STR_TO_DATE(:FechaJuntaAclaraciones, '%d/%m/%Y %H:%i'), FechaPresentacionAperturaProposiciones = STR_TO_DATE(:FechaPresentacionAperturaProposiciones, '%d/%m/%Y %H:%i'), updated_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 HOUR), NombreUnidadCompradora = :NombreUnidadCompradora,  ReferenciaExpendiente = :ReferenciaExpendiente,  DescripcionAnuncio = :DescripcionAnuncio,  TipoContratacion = :TipoContratacion,  TipoExpediente = :TipoExpediente,  es_de_TI = :es_de_TI,  razon = :razon,  clasificacion = :clasificacion;`

       
      for(const registro of data){
         promesas.push(ejecutarQuery(query, registro, "INSERT"))
      }
      const resultado = await Promise.all(promesas);
      console.log(logMensaje("resultado", resultado));
      response.body = "Completado";
      return response
   } catch (error) {
      console.log(logMensaje("error", error));
      console.log("ha ocurrido algo que provoco que se cerrara completamente el programa")
      console.log("error", error);
      response.statusCode = 500;
      response.body = error.toString();
      return response;
   }
};

