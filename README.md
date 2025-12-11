# Metal-Bands-by-Country
Project 2 made for our class named "INFORMATION VISUALIZATION", done by Carolina Barreiros and Fernanda Ribas and oriented by our professors Catarina Maçãs and Evgheni Polisciuc.
# Metal Bands Map

An interactive D3 + TopoJSON visualization that maps metal bands around the world. Use the sidebar to filter by decade, subgenre, and band status. Hover over a country to see totals based on the current filters, and click to open a modal with filterable, searchable tables of the bands by subgenre or within a specific subgenre.

## Dataset
The visualization is powered by `metal_bands_2017(data_cleanDuplicated).csv`, which contains band names, countries, status, and subgenre information.

## Running locally
Serve the static files with Python's built-in HTTP server and open the map in your browser.

```bash
python3 -m http.server 8000
# se a porta já estiver em uso, finalize o servidor anterior
fuser -k 8000/tcp
```

Then visit [http://localhost:8000/metalBands.html](http://localhost:8000/metalBands.html).

> Tip: If you run the server from a different directory, adjust the path to `metalBands.html` accordingly.
