window.MODELS = {};

window.ASSET_LOADER = {
  modelsToLoad: [
    { id: 'police', url: 'assets/models/2013_dodge_charger_srt8_-_patrol.glb' },
    { id: 'street_racer', url: 'assets/models/2017_jonny_grunwald_rocket_bunny_mazda_rx-8.glb' },
    { id: 'sports_coupe', url: 'assets/models/2020_aston_martin_dbs_gt_zagato__www.vecarz.com.glb' },
    { id: 'city_cruiser', url: 'assets/models/2025_aston_martin_valiant.glb' },
    { id: 'off_roader', url: 'assets/models/2020_seat_tarraco_e-hybrid.glb' },
    { id: 'muscle_car', url: 'assets/models/dodge_charger_nascar_43.glb' },
    { id: 'compact', url: 'assets/models/2020_seat_tarraco_e-hybrid.glb' }, // Reuse off_roader but scaled smaller
    { id: 'map', url: 'assets/models/new_york_city.glb' }
  ],
  
  init() {
    return new Promise((resolve) => {
      // If GLTFLoader is missing or models are 0, resolve immediately
      if (!THREE.GLTFLoader || this.modelsToLoad.length === 0) {
        console.warn('GLTFLoader not found or no models to load.');
        resolve();
        return;
      }

      const loader = new THREE.GLTFLoader();
      let loadedCount = 0;
      const total = this.modelsToLoad.length;
      
      this.modelsToLoad.forEach(item => {
        loader.load(
          item.url,
          (gltf) => {
            const model = gltf.scene;
            
            // Fix materials and shadows
            model.traverse(child => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // If materials are dark or broken, we could tweak them here
                // e.g. if (child.material) child.material.needsUpdate = true;
              }
            });
            
            window.MODELS[item.id] = model;
            loadedCount++;
            
            if (loadedCount === total) {
              resolve();
            }
          },
          undefined,
          (error) => {
            console.error('Error loading model:', item.url, error);
            loadedCount++;
            if (loadedCount === total) resolve();
          }
        );
      });
    });
  }
};
