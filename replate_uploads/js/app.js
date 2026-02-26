const SUPABASE_URL = 'https://bsorkpubkbzxvjadxkjg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzb3JrcHVia2J6eHZqYWR4a2pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwODM4NjQsImV4cCI6MjA4NzY1OTg2NH0.hQN5LXN_g4OlxKni_TtJwdSoB14jFMgC8Cs7eGdsmOI';
        const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        let userLocation = null;
        let map = null;
        let currentRadius = 10;
        let markers = [];

        document.addEventListener('DOMContentLoaded', async function() {
            document.getElementById('surplusDate').valueAsDate = new Date();
            await detectLocation();
            await updateDashboard();
            await loadOrganizations();
            await updateImpactReport();
        });

        async function detectLocation() {
            const statusEl = document.getElementById('locationText');
            
            if (!navigator.geolocation) {
                statusEl.textContent = 'Geolocation not supported';
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    document.getElementById('orgLat').value = userLocation.lat;
                    document.getElementById('orgLng').value = userLocation.lng;
                    statusEl.textContent = `Location detected: ${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)} ✓`;
                },
                (error) => {
                    statusEl.textContent = 'Using default location (Ludhiana)';
                    userLocation = { lat: 30.9010, lng: 75.8573 };
                    document.getElementById('orgLat').value = userLocation.lat;
                    document.getElementById('orgLng').value = userLocation.lng;
                }
            );
        }

        function calculateDistance(lat1, lon1, lat2, lon2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }

        function showPage(pageId) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(pageId).classList.add('active');
            document.querySelector(`[data-page="${pageId}"]`).classList.add('active');

            if (pageId === 'mapview' && !map) {
                setTimeout(initMap, 100);
            }
            if (pageId === 'impact') {
                updateImpactReport();
            }
        }

        let selectedType = '';
        function selectOrgType(type) {
            selectedType = type;
            document.querySelectorAll('.org-type-card').forEach(c => c.classList.remove('selected'));
            event.target.closest('.org-type-card').classList.add('selected');
            document.getElementById('orgType').value = type;
        }

        async function submitOrganization(e) {
            e.preventDefault();

            const org = {
                org_type: document.getElementById('orgType').value,
                name: document.getElementById('orgName').value,
                address: document.getElementById('orgAddress').value,
                latitude: parseFloat(document.getElementById('orgLat').value),
                longitude: parseFloat(document.getElementById('orgLng').value),
                capacity: parseFloat(document.getElementById('orgCapacity').value),
                service_time: document.getElementById('orgTime').value,
                contact: document.getElementById('orgContact').value,
                service_radius: parseFloat(document.getElementById('orgRadius').value)
            };

            const { error } = await supabaseClient.from('organizations').insert([org]);

            if (error) {
                showToast('Error: ' + error.message, 'error');
            } else {
                showToast('Organization registered successfully! 🌱', 'success');
                document.getElementById('orgForm').reset();
                selectedType = '';
                document.querySelectorAll('.org-type-card').forEach(c => c.classList.remove('selected'));
                await updateDashboard();
                await loadOrganizations();
            }
        }

        async function submitSurplus(e) {
            e.preventDefault();

            const surplus = {
                date: document.getElementById('surplusDate').value,
                meals_prepared: parseInt(document.getElementById('mealsPrepared').value),
                meals_consumed: parseInt(document.getElementById('mealsConsumed').value),
                surplus_kg: parseFloat(document.getElementById('surplusKg').value)
            };

            const { error } = await supabaseClient.from('surplus_entries').insert([surplus]);

            if (error) {
                showToast('Error: ' + error.message, 'error');
            } else {
                showToast('Surplus saved successfully! 💚', 'success');
                document.getElementById('surplusForm').reset();
                document.getElementById('surplusDate').valueAsDate = new Date();
                await matchNearbyNGO(surplus.surplus_kg);
                await updateDashboard();
                await updateSurplusList();
                await updateImpactReport();
            }
        }

        async function matchNearbyNGO(surplusKg) {
            if (!userLocation) return;

            const { data: ngos } = await supabaseClient
                .from('organizations')
                .select('*')
                .eq('org_type', 'ngo');

            if (!ngos || ngos.length === 0) {
                document.getElementById('matchResult').innerHTML = `
                    <div style="margin-top: 2rem; padding: 2rem; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 20px; border-left: 5px solid #f59e0b; box-shadow: var(--shadow-soft);">
                        <strong style="color: #92400e;">⚠️ No NGOs registered yet</strong>
                    </div>
                `;
                return;
            }

            const nearby = ngos
                .map(ngo => ({
                    ...ngo,
                    distance: calculateDistance(userLocation.lat, userLocation.lng, ngo.latitude, ngo.longitude)
                }))
                .filter(ngo => ngo.distance <= ngo.service_radius && ngo.capacity >= surplusKg)
                .sort((a, b) => a.distance - b.distance);

            if (nearby.length === 0) {
                document.getElementById('matchResult').innerHTML = `
                    <div style="margin-top: 2rem; padding: 2rem; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 20px; border-left: 5px solid #f59e0b; box-shadow: var(--shadow-soft);">
                        <strong style="color: #92400e;">⚠️ No nearby NGO available</strong>
                    </div>
                `;
                return;
            }

            const matched = nearby[0];
            document.getElementById('matchResult').innerHTML = `
                <div style="margin-top: 2rem; padding: 2.5rem; background: var(--gradient-sage); border-radius: 24px; box-shadow: var(--shadow-medium);">
                    <h3 style="color: white; margin-bottom: 1.5rem; font-size: 1.5rem; text-shadow: 0 2px 8px rgba(0,0,0,0.2);">✅ NGO Matched Successfully!</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.5rem;">
                        <div style="color: rgba(255,255,255,0.95);"><strong>NGO:</strong><br><span style="font-size: 1.1rem; color: white;">${matched.name}</span></div>
                        <div style="color: rgba(255,255,255,0.95);"><strong>Distance:</strong><br><span style="font-size: 1.1rem; color: white;">${matched.distance.toFixed(2)} km</span></div>
                        <div style="color: rgba(255,255,255,0.95);"><strong>Contact:</strong><br><span style="font-size: 1.1rem; color: white;">${matched.contact}</span></div>
                        <div style="color: rgba(255,255,255,0.95);"><strong>Pickup:</strong><br><span style="font-size: 1.1rem; color: white;">${matched.service_time}</span></div>
                    </div>
                </div>
            `;
        }

        async function updateSurplusList() {
            const { data: surplus } = await supabaseClient
                .from('surplus_entries')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);

            if (!surplus || surplus.length === 0) {
                document.getElementById('surplusList').innerHTML = '<p style="text-align: center; padding: 3rem; color: var(--sage-dark); font-weight: 500;">No entries yet. Add your first surplus! 🌱</p>';
                return;
            }

            document.getElementById('surplusList').innerHTML = `
                <div class="mobile-cards-grid">
                    ${surplus.map(s => `
                        <div class="mobile-card">
                            <div class="mobile-card-row"><span class="mobile-card-label">📅 Date</span><strong>${s.date}</strong></div>
                            <div class="mobile-card-row"><span class="mobile-card-label">🍽️ Prepared</span>${s.meals_prepared} meals</div>
                            <div class="mobile-card-row"><span class="mobile-card-label">✅ Consumed</span>${s.meals_consumed} meals</div>
                            <div class="mobile-card-row"><span class="mobile-card-label">📦 Surplus</span><strong style="color:var(--forest-dark)">${s.surplus_kg} kg</strong></div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        function initMap() {
            if (map) return;

            const center = userLocation || { lat: 30.9010, lng: 75.8573 };
            map = L.map('mapContainer').setView([center.lat, center.lng], 12);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(map);

            L.marker([center.lat, center.lng], {
                icon: L.divIcon({
                    html: '<div style="background: #C17C5C; width: 22px; height: 22px; border-radius: 50%; border: 4px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
                    className: '',
                    iconSize: [22, 22]
                })
            }).addTo(map).bindPopup('<strong>📍 You are here</strong>');

            loadMapMarkers();
        }

        async function loadMapMarkers() {
            if (!map || !userLocation) return;

            markers.forEach(m => map.removeLayer(m));
            markers = [];

            const { data: orgs } = await supabaseClient.from('organizations').select('*');

            if (!orgs) return;

            orgs.forEach(org => {
                const distance = calculateDistance(userLocation.lat, userLocation.lng, org.latitude, org.longitude);
                
                if (distance > currentRadius) return;

                const color = org.org_type === 'ngo' ? '#2C5F4D' : '#7A9B8E';
                const icon = L.divIcon({
                    html: `<div style="background: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.2);"></div>`,
                    className: '',
                    iconSize: [16, 16]
                });

                const marker = L.marker([org.latitude, org.longitude], { icon })
                    .addTo(map)
                    .bindPopup(`
                        <strong>${org.name}</strong><br>
                        <span style="color: #7A9B8E; font-weight: 600;">${org.org_type.toUpperCase()}</span><br>
                        📍 ${distance.toFixed(2)} km away
                    `);

                markers.push(marker);
            });

            updateNearbyList(orgs);
        }

        function updateNearbyList(orgs) {
            if (!userLocation) return;

            const nearby = orgs
                .map(org => ({
                    ...org,
                    distance: calculateDistance(userLocation.lat, userLocation.lng, org.latitude, org.longitude)
                }))
                .filter(org => org.distance <= currentRadius)
                .sort((a, b) => a.distance - b.distance);

            document.getElementById('nearbyCount').textContent = nearby.length;

            if (nearby.length === 0) {
                document.getElementById('nearbyList').innerHTML = '<p style="text-align: center; color: var(--sage-dark); padding: 3rem; font-weight: 500;">No organizations within selected radius 🌿</p>';
                return;
            }

            document.getElementById('nearbyList').innerHTML = nearby.map(org => `
                <div class="nearby-item">
                    <div class="org-badge badge-${org.org_type}">${org.org_type.toUpperCase()}</div>
                    <h4 style="color: var(--forest-darker); font-size: 1.1rem; margin-bottom: 0.5rem;">${org.name}</h4>
                    <p style="color: var(--sage-dark); font-size: 0.9rem; margin: 0.3rem 0;">${org.address}</p>
                    <div style="background: var(--gradient-sage); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-weight: 700; margin-top: 0.8rem; font-size: 1.05rem;">📍 ${org.distance.toFixed(2)} km away</div>
                </div>
            `).join('');
        }

        function changeRadius(km) {
            currentRadius = km;
            document.querySelectorAll('.radius-btn').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
            if (map) loadMapMarkers();
        }

        async function loadOrganizations() {
            const { data: orgs } = await supabaseClient.from('organizations').select('*').order('created_at', { ascending: false });

            if (!orgs || orgs.length === 0) {
                document.getElementById('orgList').innerHTML = '<p style="text-align: center; padding: 3rem; color: var(--sage-dark); font-weight: 500;">No organizations registered yet 🌱</p>';
                return;
            }

            document.getElementById('orgList').innerHTML = `
                <div class="mobile-cards-grid">
                    ${orgs.map(org => `
                        <div class="mobile-card">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem;">
                                <span class="org-badge badge-${org.org_type}">${org.org_type.toUpperCase()}</span>
                                <button class="btn btn-danger" onclick="deleteOrg(${org.id})">🗑️</button>
                            </div>
                            <div class="mobile-card-row"><span class="mobile-card-label">🏢 Name</span><strong>${org.name}</strong></div>
                            <div class="mobile-card-row"><span class="mobile-card-label">📍 Address</span>${org.address}</div>
                            <div class="mobile-card-row"><span class="mobile-card-label">⚖️ Capacity</span><strong>${org.capacity} kg</strong></div>
                            <div class="mobile-card-row"><span class="mobile-card-label">📞 Contact</span>${org.contact}</div>
                            <div class="mobile-card-row"><span class="mobile-card-label">📡 Radius</span>${org.service_radius} km</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        async function deleteOrg(id) {
            if (!confirm('Delete this organization?')) return;

            const { error } = await supabaseClient.from('organizations').delete().eq('id', id);

            if (error) {
                showToast('Error deleting', 'error');
            } else {
                showToast('Deleted successfully 🗑️', 'success');
                await loadOrganizations();
                await updateDashboard();
                if (map) loadMapMarkers();
            }
        }

        async function updateDashboard() {
            const { data: orgs } = await supabaseClient.from('organizations').select('*');
            const { data: surplus } = await supabaseClient.from('surplus_entries').select('*');

            document.getElementById('totalOrgs').textContent = orgs ? orgs.length : 0;

            if (surplus && surplus.length > 0) {
                const weekData = surplus.slice(-7);
                const weekTotal = weekData.reduce((sum, s) => sum + s.surplus_kg, 0);
                document.getElementById('weekSurplus').textContent = weekTotal.toFixed(1);

                const monthData = surplus.slice(-30);
                const monthTotal = monthData.reduce((sum, s) => sum + s.surplus_kg, 0);
                const co2 = monthTotal * 2.5;
                const people = Math.round(monthTotal / 0.5);
                
                document.getElementById('co2Saved').textContent = co2.toFixed(1);
                document.getElementById('peopleFed').textContent = people;

                updateWeeklyChart(weekData);
                updateMonthlyImpactChart(monthData);
                updateRecentActivity(surplus.slice(-5).reverse());
            }
        }

        function updateWeeklyChart(data) {
            const ctx = document.getElementById('weeklyChart');
            if (!ctx) return;

            if (window.weeklyChartInstance) {
                window.weeklyChartInstance.destroy();
            }

            window.weeklyChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.map((d, i) => `Day ${i + 1}`),
                    datasets: [{
                        label: 'Surplus (kg)',
                        data: data.map(d => d.surplus_kg),
                        borderColor: '#7A9B8E',
                        backgroundColor: 'rgba(122, 155, 142, 0.15)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 5,
                        pointBackgroundColor: '#7A9B8E',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(122, 155, 142, 0.1)' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        function updateMonthlyImpactChart(data) {
            const ctx = document.getElementById('monthlyImpactChart');
            if (!ctx) return;

            if (window.monthlyChartInstance) {
                window.monthlyChartInstance.destroy();
            }

            const weeks = [];
            for (let i = 0; i < 4; i++) {
                const weekData = data.slice(i * 7, (i + 1) * 7);
                const weekTotal = weekData.reduce((sum, d) => sum + d.surplus_kg, 0);
                weeks.push(weekTotal);
            }

            window.monthlyChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                    datasets: [
                        {
                            label: 'Food (kg)',
                            data: weeks,
                            backgroundColor: 'rgba(122, 155, 142, 0.8)',
                            borderRadius: 8,
                            yAxisID: 'y'
                        },
                        {
                            label: 'CO₂ (kg)',
                            data: weeks.map(w => w * 2.5),
                            backgroundColor: 'rgba(139, 111, 71, 0.8)',
                            borderRadius: 8,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: true, position: 'top' } },
                    scales: {
                        y: {
                            type: 'linear',
                            position: 'left',
                            title: { display: true, text: 'Food (kg)', color: '#7A9B8E' },
                            grid: { color: 'rgba(122, 155, 142, 0.1)' }
                        },
                        y1: {
                            type: 'linear',
                            position: 'right',
                            title: { display: true, text: 'CO₂ (kg)', color: '#8B6F47' },
                            grid: { drawOnChartArea: false }
                        }
                    }
                }
            });
        }

        function updateRecentActivity(data) {
            if (!data || data.length === 0) {
                document.getElementById('recentActivity').innerHTML = '<p style="text-align: center; padding: 3rem; color: var(--sage-dark); font-weight: 500;">No recent activity 🌿</p>';
                return;
            }

            document.getElementById('recentActivity').innerHTML = `
                <div class="mobile-cards-grid">
                    ${data.map(s => `
                        <div class="mobile-card">
                            <div class="mobile-card-row"><span class="mobile-card-label">📅 Date</span><strong>${s.date}</strong></div>
                            <div class="mobile-card-row"><span class="mobile-card-label">🍽️ Prepared</span>${s.meals_prepared} meals</div>
                            <div class="mobile-card-row"><span class="mobile-card-label">✅ Consumed</span>${s.meals_consumed} meals</div>
                            <div class="mobile-card-row"><span class="mobile-card-label">📦 Surplus</span><strong style="color:var(--forest-dark)">${s.surplus_kg} kg</strong></div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        async function updateImpactReport() {
            const { data: surplus } = await supabaseClient.from('surplus_entries').select('*');

            if (!surplus || surplus.length === 0) return;

            const totalFood = surplus.reduce((sum, s) => sum + s.surplus_kg, 0);
            const totalCO2 = totalFood * 2.5;
            const trees = Math.round(totalCO2 / 20);
            const people = Math.round(totalFood / 0.5);
            const credit = Math.round((totalCO2 / 1000) * 800);
            const deliveries = surplus.length;

            document.getElementById('totalFoodSaved').textContent = totalFood.toFixed(1);
            document.getElementById('totalCO2').textContent = totalCO2.toFixed(1);
            document.getElementById('treesEquiv').textContent = trees;
            document.getElementById('totalPeopleFed').textContent = people;
            document.getElementById('carbonCredit').textContent = credit.toLocaleString();
            document.getElementById('totalDeliveries').textContent = deliveries;

            const avgDaily = totalFood / surplus.length;
            const annualFood = (avgDaily * 365).toFixed(0);
            const annualPeople = Math.round((avgDaily * 365) / 0.5);
            const annualCO2 = ((avgDaily * 365 * 2.5) / 1000).toFixed(2);
            const annualRevenue = (((avgDaily * 365 * 2.5) / 1000) * 800 / 100000).toFixed(2);

            document.getElementById('annualFood').textContent = annualFood;
            document.getElementById('annualPeople').textContent = annualPeople.toLocaleString();
            document.getElementById('annualCO2').textContent = annualCO2;
            document.getElementById('annualRevenue').textContent = annualRevenue;

            updateImpactChart(surplus);
        }

        function updateImpactChart(data) {
            const ctx = document.getElementById('impactChart');
            if (!ctx) return;

            if (window.impactChartInstance) {
                window.impactChartInstance.destroy();
            }

            const monthData = data.slice(-30);
            const weeks = [];
            for (let i = 0; i < 4; i++) {
                const weekData = monthData.slice(i * 7, (i + 1) * 7);
                const weekTotal = weekData.reduce((sum, d) => sum + d.surplus_kg, 0);
                weeks.push(weekTotal);
            }

            window.impactChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                    datasets: [
                        {
                            label: 'Food (kg)',
                            data: weeks,
                            borderColor: '#7A9B8E',
                            backgroundColor: 'rgba(122, 155, 142, 0.15)',
                            borderWidth: 3,
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: 'CO₂ (kg)',
                            data: weeks.map(w => w * 2.5),
                            borderColor: '#C17C5C',
                            backgroundColor: 'rgba(193, 124, 92, 0.15)',
                            borderWidth: 3,
                            tension: 0.4,
                            fill: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: true, position: 'top' } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(122, 155, 142, 0.1)' } }
                    }
                }
            });
        }

        function showToast(message, type) {
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `<span style="font-size: 1.5rem;">${type === 'success' ? '✅' : '❌'}</span><div><strong>${message}</strong></div>`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3500);
        }
