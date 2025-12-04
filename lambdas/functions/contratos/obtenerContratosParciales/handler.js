const { response, logMensaje } = require("utils");
const {
   GetObjectCommand,
   PutObjectCommand,
   S3Client,
} = require("@aws-sdk/client-s3");
let posicionActual = 0;
let reintentos;
let fechaInput;
let dataGlobal;
let fecha;
let dataInput;
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
let browser;
const { execSync } = require('child_process');
const client = new S3Client({});

exports.obtenerContratosParciales = async (event) => {
   console.log(logMensaje("event", event));
   response.statusCode = 200;
   const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
   const bucket = event.detail.bucket.name;
   const key = event.detail.object.key;
   const parametros = {
      Bucket: bucket,
      Key: key,
   };
   try {
      const comando = new GetObjectCommand(parametros);
      const obtener = await client.send(comando);
      const stream = obtener.Body;
      const buff = Buffer.concat(await stream.toArray());
      dataInput = JSON.parse(buff.toString());
      dataGlobal = JSON.parse(JSON.stringify(dataInput.data));
      fechaInput = dataInput.fechaInput;
      fecha = dataInput.fecha;
      posicionActual = dataInput.posicionActual;
      browser = await puppeteer.launch({
         executablePath: await chromium.executablePath(),
         headless: chromium.headless,
         ignoreHTTPSErrors: true,
         defaultViewport: chromium.defaultViewport,
         args: [
            ...chromium.args,
            "--hide-scrollbars",
            "--disable-web-security",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--single-process",
            "--disable-gpu"
         ],
      });
      const page = await browser.newPage();

      await page.goto('https://comprasmx.buengobierno.gob.mx/sitiopublico/#/', {
         waitUntil: 'networkidle2',
         timeout: 60000
      });
      await page.evaluate((fechaInput) => {
         const obj = {
            "id_ley": null, "id_tipo_procedimiento": null, "id_tipo_contratacion": null, "fecha_apertura_inicio": null, "fecha_apertura_fin": null,
            "fecha_publicacion_inicio": fechaInput.fechaInicial,
            "fecha_publicacion_fin": fechaInput.fechaFinal,
            "id_tipo_dependencia": [], "numero_procedimiento": null, "nombre_procedimiento": null, "credito_externo": null, "exclusivo_mipymes": null, "id_forma_participacion": null, "id_entidad_federativa": [], "id_p_especifica": [], "id_caracter_procedimiento": null, "id_estatus": 0, "id_proceso": 0, "codigo_expediente": null, "codigo_procedimiento": null, "estatus_alterno": [], "compra_consolidada": false
         };
         localStorage.setItem('filter', 1);
         localStorage.setItem('filtro', JSON.stringify(obj));
      }, fechaInput);

      await page.reload({ waitUntil: 'networkidle2' });

      await page.waitForSelector('p-table table tbody tr', {
         timeout: 15000
      });
      await new Promise(resolve => setTimeout(resolve, 500));

      await page.waitForSelector('p-table table tbody tr', {
         timeout: 15000
      });
      for (let i = posicionActual; i < dataGlobal.length; i++) {

         const paginaDeseada = Math.floor((posicionActual) / 100) + 1;
         const contador = Number(posicionActual + 1) - Math.floor((posicionActual) / 100) * 100;

         if (paginaDeseada > 1) {
            const selectorPagina = `.p-paginator-pages button[aria-label="${paginaDeseada}"]`;

            try {
               // Verificar si ya estamos en la página correcta
               const estaSeleccionado = await page.evaluate((sel) => {
                  const boton = document.querySelector(sel);
                  return boton && boton.classList.contains('p-highlight');
               }, selectorPagina);

               if (!estaSeleccionado) {
                  // Esperar a que el botón esté disponible
                  await page.waitForSelector(selectorPagina, { timeout: 10000, visible: true });

                  // Capturar el contenido actual de la tabla ANTES del click
                  const contenidoAnterior = await page.evaluate(() => {
                     const tabla = document.querySelector('table tbody'); // Ajusta el selector según tu tabla
                     return tabla ? tabla.innerText : '';
                  });

                  // Hacer click
                  await page.click(selectorPagina);

                  // Pequeña pausa para que inicie la transición
                  await delay(100);

                  // Esperar a que el contenido de la tabla CAMBIE
                  await page.waitForFunction(
                     (contenidoAntes) => {
                        const tabla = document.querySelector('table tbody'); // Ajusta el selector según tu tabla
                        if (!tabla) return false;
                        const contenidoAhora = tabla.innerText;
                        return contenidoAhora !== contenidoAntes && contenidoAhora.length > 0;
                     },
                     { timeout: 15000 },
                     contenidoAnterior
                  );

                  // Esperar a que el botón tenga la clase p-highlight
                  await page.waitForFunction(
                     (selector) => {
                        const boton = document.querySelector(selector);
                        return boton && boton.classList.contains('p-highlight');
                     },
                     { timeout: 10000 },
                     selectorPagina
                  );

                  // Esperar a que las filas estén completamente cargadas
                  await delay(300);
                  await waitForRows(10, 500, page);

                  console.log(`Navegado exitosamente a la página ${paginaDeseada}`);
               }

            } catch (e) {
               console.log(`Error fatal: No se pudo navegar a la página ${paginaDeseada}`);
               console.log(e);
               throw e;
            }
         }

         const selector = `p-table table tbody tr:nth-child(${contador}) td:nth-child(2)`;

         try {
            await page.waitForSelector(selector, { timeout: 10000, visible: true });
            await page.evaluate((sel) => {
               const element = document.querySelector(sel);
               if (element) {
                  element.click();
               } else {
                  throw new Error(`Elemento ${sel} no encontrado en DOM para evaluate.click`);
               }
            }, selector);

         } catch (e) {
            console.log(`Falló el clic en el item: ${selector}. Saltando al siguiente.`);
            console.log(e);
            await page.goto('https://comprasmx.buengobierno.gob.mx/sitiopublico/#/', {
               waitUntil: 'networkidle2',
               timeout: 60000
            });
            await waitForRows(10, 500, page);

            posicionActual++;
            continue;
         }
         try {
            dataGlobal[i].URL = '';
            dataGlobal[i].detalles = await extractDetails(page);
            dataGlobal[i].URL = dataGlobal[i].detalles.URL;
         } catch (extractError) {
            console.error(LogError("extractDetails", extractError, { data: dataGlobal[i] }));
            console.log(`Falló extractDetails en el item ${i + 1}. Saltando.`);
            console.log(extractError.message);
            dataGlobal[i].detalles = { error: `Falló la extracción: ${extractError.message}` };

            await page.goto('https://comprasmx.buengobierno.gob.mx/sitiopublico/#/', { waitUntil: 'networkidle2' });
            await waitForRows(10, 500, page);

            posicionActual++;
            continue;
         }
         await page.goto('https://comprasmx.buengobierno.gob.mx/sitiopublico/#/', { waitUntil: 'networkidle2' });
         await waitForRows(10, 500, page);

         console.log(`Progreso: ${i + 1} / ${dataGlobal.length}`);

         posicionActual++;
         if ((i + 1) % 50 === 0 && i < (dataGlobal.length - 1)) {
            await browser.close();
            const respuesta = await guardarParcial(dataGlobal, posicionActual, false);
            console.log(respuesta);
            console.log("Consulta parcial ------------------------->");
            response.body = "Completado";
            return response;
         }
      }

      await browser.close();
      const command = new PutObjectCommand({
         Bucket: process.env.BUCKETNAME,
         Key: process.env.CARPETA + "/" + fecha + ".json",
         Body: JSON.stringify(dataGlobal),
      });
      const respuesta = await client.send(command);
      console.log(respuesta);
      response.body = "Completado";
      return response
   } catch (error) {
      await browser.close();
      /** LogError(funcion, error, datos)
       * funcion: Nombre de la funcion donde ocurre el error
       * error: Objeto error capturado
       * datos: Datos relevantes al contexto del error
       */
      console.error(LogError("main", error, { posicionActual, reintentos, fechaInput, fecha }));
      execSync('rm -rf /tmp/chromium*');
      console.log(logMensaje("error", error));
      console.log("error", error);
      if (reintentos !== undefined && reintentos !== null && reintentos < 2) {
         const respuesta = await guardarParcial(dataGlobal, posicionActual, true);
         console.log(logMensaje("respuesta", respuesta));
         response.body = "Error";
      }
      return response
   }
};



function guardarParcial(dataActual, posicionActual, error) {
   return new Promise(async (resolve, reject) => {
      try {
         const reintento = error ? Number(reintentos) + 1 : 0;
         const data = {
            fecha: fecha,
            fechaInput: fechaInput,
            data: dataActual,
            posicionActual: posicionActual,
            reintento
         }
         console.log(logMensaje("data.fecha", data.fecha));
         console.log(logMensaje("data.fechaInput", data.fechaInput));
         console.log(logMensaje("data.posicionActual", data.posicionActual));
         console.log(logMensaje("data.reintento", data.reintento));

         const command = new PutObjectCommand({
            Bucket: process.env.BUCKETNAME,
            Key: process.env.PARCIAL + "/" + fecha + ".json",
            Body: JSON.stringify(data),
         });
         const respuesta = await client.send(command);
         resolve(respuesta);
      } catch (error) {
         console.error(LogError("guardarParcial", error, { dataActual, posicionActual, error }));
         console.log(error);
         reject(error);
      }
   });
}

async function waitForRows(retries = 5, delay = 100, page) {
   for (let attempt = 0; attempt < retries; attempt++) {
      const rows = await page.$$('p-table table tbody tr');
      if (rows.length > 2) return rows;
      await new Promise(r => setTimeout(r, delay));
   }
   return [];
}


async function extractDetails(page) {
   try {
      await page.waitForSelector('app-sitiopublico-detalle-economicos-pc p-table tbody tr', { timeout: 20000 });
   } catch (error) {
      console.log("Error: No se pudo encontrar el contenido de las tablas económicas a tiempo.", error.message);
      throw new Error("No se cargo");
   }
   const details = await page.evaluate(() => {
      const scrapedData = {};
      const sectionTitles = document.querySelectorAll('.titulo-seccion');
      const excludedSections = ["CRÉDITO EXTERNO", "ANEXOS", "ECONÓMICOS"];

      sectionTitles.forEach(titleElement => {
         const title = titleElement.querySelector('span')?.innerText.trim();
         if (!title || excludedSections.includes(title)) {
            return;
         }

         const contentContainer = titleElement.nextElementSibling?.nextElementSibling;
         if (!contentContainer) {
            return;
         }

         const sectionDetails = {};
         const fields = contentContainer.querySelectorAll('div[class*="col-"]');

         fields.forEach(field => {
            const label = field.querySelector('label.font-bold');
            const valueElement = field.querySelector('span') || field.querySelector('label:not(.font-bold)');

            if (label && valueElement) {
               const key = label.innerText.trim().replace(/:$/, '');
               const value = valueElement.innerText.trim();
               if (key && value) {
                  sectionDetails[key] = value;
               }
            }
         });

         if (Object.keys(sectionDetails).length > 0) {
            scrapedData[title] = sectionDetails;
         }
      });

      const requirementsNode = Array.from(document.querySelectorAll('h1.tituloHome'))
         .find(h1 => h1.innerText.trim() === 'REQUERIMIENTOS');

      if (requirementsNode) {
         const economicContainer = requirementsNode.parentElement.querySelector('app-sitiopublico-detalle-economicos-pc');

         if (economicContainer) {
            const partidaContainers = economicContainer.querySelectorAll('div.grid.ng-star-inserted');

            if (partidaContainers.length > 0) {
               let genericCounter = 1;

               partidaContainers.forEach(container => {
                  const partidaH1 = container.querySelector('h1.tituloHome');
                  const table = container.querySelector('p-table table');

                  if (table) {
                     const tableData = extractTableData(table);
                     if (tableData.length > 0) {
                        if (!scrapedData.hasOwnProperty("Requerimientos")) {
                           scrapedData["Requerimientos"] = {};
                        }

                        let partidaName;
                        if (partidaH1) {
                           partidaName = partidaH1.innerText.trim();
                           const partidaDesc = container.querySelector('p');
                           const partidaDescription = partidaDesc ? partidaDesc.innerText.trim() : '';
                           if (partidaDescription) {
                              partidaName = `${partidaName} - ${partidaDescription}`;
                           }
                        } else {
                           partidaName = `Requerimientos económicos ${genericCounter}`;
                           genericCounter++;
                        }

                        scrapedData["Requerimientos"][partidaName] = tableData;
                     }
                  }
               });
            } else {
               const tables = economicContainer.querySelectorAll('p-table table');
               tables.forEach((table, index) => {
                  const tableData = extractTableData(table);
                  if (tableData.length > 0) {
                     if (!scrapedData.hasOwnProperty("Requerimientos")) {
                        scrapedData["Requerimientos"] = {};
                     }
                     scrapedData["Requerimientos"][`Requerimientos económicos ${index + 1}`] = tableData;
                  }
               });
            }
         } else {
            console.log('No se encontró el contenedor <app-sitiopublico-detalle-economicos-pc>');
         }
      } else {
         console.log('No se encontró el H1 "REQUERIMIENTOS"');
      }

      function extractTableData(tableElement) {
         const headers = Array.from(tableElement.querySelectorAll('thead th')).map(th => th.innerText.trim());
         const columnMapping = {
            num: headers.indexOf('Núm.'),
            partidaEspecifica: headers.indexOf('Partida específica'),
            claveCucop: headers.indexOf('Clave CUCoP+'),
            descCucop: headers.indexOf('Descripción CUCoP+'),
            descDetallada: headers.indexOf('Descripción detallada'),
            unidadMedida: headers.indexOf('Unidad de medida'),
            cantSolicitada: headers.indexOf('Cantidad solicitada'),
            cantMinima: headers.indexOf('Cantidad mínima'),
            cantMaxima: headers.indexOf('Cantidad máxima')
         };

         const rows = [];
         tableElement.querySelectorAll('tbody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 0) return;

            const rowData = {};

            if (columnMapping.num !== -1) rowData['Núm.'] = cells[columnMapping.num]?.innerText.trim();
            if (columnMapping.partidaEspecifica !== -1) rowData['Partida específica'] = cells[columnMapping.partidaEspecifica]?.innerText.trim();
            if (columnMapping.claveCucop !== -1) rowData['Clave CUCoP+'] = cells[columnMapping.claveCucop]?.innerText.trim();
            if (columnMapping.descCucop !== -1) rowData['Descripción CUCoP+'] = cells[columnMapping.descCucop]?.innerText.trim();
            if (columnMapping.descDetallada !== -1) rowData['Descripción detallada'] = cells[columnMapping.descDetallada]?.innerText.trim();
            if (columnMapping.unidadMedida !== -1) rowData['Unidad de medida'] = cells[columnMapping.unidadMedida]?.innerText.trim();
            if (columnMapping.cantSolicitada !== -1) {
               rowData['Cantidad solicitada'] = cells[columnMapping.cantSolicitada]?.innerText.trim();
            } else {
               if (columnMapping.cantMinima !== -1) rowData['Cantidad mínima'] = cells[columnMapping.cantMinima]?.innerText.trim();
               if (columnMapping.cantMaxima !== -1) rowData['Cantidad máxima'] = cells[columnMapping.cantMaxima]?.innerText.trim();
            }

            rows.push(rowData);
         });
         return rows;
      }

      return scrapedData;
   });
   details.URL = page.url();
   return details;
}