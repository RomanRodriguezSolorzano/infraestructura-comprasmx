# Infraestructura de AWS para la API de Compras MX
En este repositorio se encuentra el código necesario para desplegar la API que se utiliza en el proceso de obtenecion de licitaciones publicas del sitio de compras mx.

## Despliegue 

### Paso 1
Usando la terminal vamos a ubicarnos en la raíz del proyecto considerando que en esta ubicación se encuentre los archivos `template.yaml` y `samconfig.toml`, utilizando la terminal.

### Paso 2
Ejecutar los siguientes comandos y espererar al despliegue.
```
sam build
sam deploy
```

## Extra
Para hacer pruebas con esta infraestructura puedes utilizar el siguiente comando:
```
sam sync --config-file samconfig.toml --watch
```