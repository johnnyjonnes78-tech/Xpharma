/**
 * Support Widget Component
 * Chatbot d'assistance intégré pour PharmaProjet
 */

function initSupportWidget() {
    // 1. Injecter le CSS
    const css = `
        #support-widget-container {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 9999;
            font-family: 'Inter', sans-serif;
        }

        .support-fab {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, #1B6FAE, #2980b9);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(27, 111, 174, 0.4);
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            position: absolute;
            bottom: 0;
            right: 0;
            z-index: 2;
        }

        .support-fab:hover {
            transform: scale(1.1);
        }

        .support-fab svg {
            width: 28px;
            height: 28px;
        }
        
        .support-pulse {
            position: absolute;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: #1B6FAE;
            z-index: 1;
            right: 0;
            bottom: 0;
            animation: supportPulseAnim 2s infinite;
            opacity: 0;
        }
        
        @keyframes supportPulseAnim {
            0% { transform: scale(1); opacity: 0.6; }
            100% { transform: scale(1.6); opacity: 0; }
        }

        .support-window {
            position: absolute;
            bottom: 80px;
            right: 0;
            width: 320px;
            height: 450px;
            background: #fff;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transform: scale(0);
            transform-origin: bottom right;
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s;
            opacity: 0;
            pointer-events: none;
            border: 1px solid rgba(0,0,0,0.05);
        }

        .support-window.open {
            transform: scale(1);
            opacity: 1;
            pointer-events: auto;
        }

        .support-header {
            background: linear-gradient(135deg, #1B6FAE, #2980b9);
            color: #fff;
            padding: 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .support-header-info {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .support-avatar {
            width: 36px;
            height: 36px;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .support-title {
            font-weight: 700;
            font-size: 15px;
            margin: 0;
        }

        .support-subtitle {
            font-size: 11px;
            opacity: 0.8;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .support-status-dot {
            width: 6px;
            height: 6px;
            background: #2ecc71;
            border-radius: 50%;
        }

        .support-close {
            background: none;
            border: none;
            color: #fff;
            cursor: pointer;
            opacity: 0.7;
            transition: opacity 0.2s;
        }

        .support-close:hover {
            opacity: 1;
        }

        .support-body {
            flex: 1;
            background: #f8f9fa;
            padding: 16px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .chat-bubble {
            max-width: 85%;
            padding: 10px 14px;
            border-radius: 14px;
            font-size: 13px;
            line-height: 1.4;
            animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        
        @keyframes popIn {
            0% { transform: scale(0.8); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
        }

        .chat-bot {
            background: #fff;
            color: #333;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            border: 1px solid rgba(0,0,0,0.03);
        }

        .chat-user {
            background: #1B6FAE;
            color: #fff;
            align-self: flex-end;
            border-bottom-right-radius: 4px;
            box-shadow: 0 1px 3px rgba(27, 111, 174, 0.2);
        }

        .support-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 4px;
        }

        .support-btn {
            background: #fff;
            border: 1px solid #1B6FAE;
            color: #1B6FAE;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .support-btn:hover {
            background: #1B6FAE;
            color: #fff;
        }

        .support-footer {
            padding: 12px;
            background: #fff;
            border-top: 1px solid rgba(0,0,0,0.05);
            text-align: center;
        }
        
        .whatsapp-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: #25D366;
            color: #fff;
            text-decoration: none;
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            transition: background 0.2s;
            width: 100%;
            justify-content: center;
            box-sizing: border-box;
        }
        
        .whatsapp-btn:hover {
            background: #128C7E;
        }
        
        @media (max-width: 480px) {
            #support-widget-container {
                bottom: 80px;
                right: 16px;
            }
            .support-window {
                right: 0;
                bottom: 74px;
                width: calc(100vw - 32px);
            }
        }
    `;

    const styleEl = document.createElement('style');
    styleEl.innerHTML = css;
    document.head.appendChild(styleEl);

    // 2. Injecter le HTML
    const html = `
        <div id="support-widget-container">
            <div class="support-pulse" id="support-pulse"></div>
            <div class="support-window" id="support-window">
                <div class="support-header">
                    <div class="support-header-info">
                        <div class="support-avatar">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                        </div>
                        <div>
                            <div class="support-title">Assistant IA TrillionX</div>
                            <div class="support-subtitle"><div class="support-status-dot"></div> Toujours en ligne</div>
                        </div>
                    </div>
                    <button class="support-close" onclick="toggleSupportWindow()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                </div>
                <div class="support-body" id="support-chat-body">
                    <div class="chat-bubble chat-bot">
                        Bonjour ! 👋 Je suis l'assistant virtuel de PharmaProjet. En quoi puis-je vous aider aujourd'hui ?
                    </div>
                </div>
                <div class="support-footer">
                    <a href="https://wa.me/224627171397?text=Bonjour%20TrillionX%2C%20j%27ai%20besoin%20d%27assistance%20avec%20PharmaProjet." target="_blank" class="whatsapp-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                        Parler à un Humain (WhatsApp)
                    </a>
                </div>
            </div>
            
            <div class="support-fab" onclick="toggleSupportWindow()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    showOptions();
}

let supportChatOpen = false;

window.toggleSupportWindow = function() {
    const w = document.getElementById('support-window');
    const p = document.getElementById('support-pulse');
    if (supportChatOpen) {
        w.classList.remove('open');
        p.style.display = 'block';
    } else {
        w.classList.add('open');
        p.style.display = 'none';
        
        // Hide native whatsapp floating button if it exists
        const oldFab = document.getElementById('support-chat-fab');
        if(oldFab) oldFab.style.display = 'none';
    }
    supportChatOpen = !supportChatOpen;
}

// Fonction pour vérifier si on est sur la page de login et masquer le widget
function checkWidgetVisibility() {
    const widget = document.getElementById('support-widget-container');
    if (!widget) return;
    const isLogin = document.getElementById('login-page') && document.getElementById('login-page').style.display !== 'none';
    widget.style.display = isLogin ? 'none' : 'block';
}

// Observer les changements du DOM pour masquer/afficher selon la page
const observer = new MutationObserver((mutations) => {
    checkWidgetVisibility();
});
window.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
});

const FAQ_DATABASE = {
    'dette': "Pour gérer les ardoises, allez dans 'Point de Vente' et sélectionnez le paiement par 'Crédit'. Le plafond est configuré dans le dossier Patient.",
    'ventes': "Les ventes récentes se trouvent dans 'Historique des Ventes'. Cliquez sur l'œil noir pour voir ou annuler la facture.",
    'assurance': "Dans la fiche patient, activez 'Statut Assuré', puis au Point de Vente, choisissez Paiement par Assurance. L'ERP isolera la part prise en charge.",
    'peremption': "Le tableau de bord signale automatiquement les lots proches (>3mois) à expirer. Allez dans 'Gestion des Stocks > FEFO' pour valider le déstockage.",
    'imprimante': "Utilisez une imprimante thermique Bluetooth (Ex: Xprinter). Allez dans les Paramètres Android pour l'appairer, PharmaProjet s'en charge ensuite."
};

function showOptions() {
    const body = document.getElementById('support-chat-body');
    const acts = document.createElement('div');
    acts.className = 'support-actions';
    acts.innerHTML = `
        <button class="support-btn" onclick="askQuestion('Comment gérer les crédits/dettes ?', 'dette')">Dettes & Crédit</button>
        <button class="support-btn" onclick="askQuestion('Comment annuler une vente ?', 'ventes')">Annuler Vente</button>
        <button class="support-btn" onclick="askQuestion('Où gérer le Tiers-Payant / Assurance ?', 'assurance')">Assurance</button>
        <button class="support-btn" onclick="askQuestion('Comment connecter l\'imprimante ?', 'imprimante')">Imprimante</button>
    `;
    body.appendChild(acts);
    body.scrollTop = body.scrollHeight;
}

window.askQuestion = function(text, key) {
    const body = document.getElementById('support-chat-body');
    
    // Remove previous action buttons to clean up history
    const oldActs = body.querySelectorAll('.support-actions');
    oldActs.forEach(e => e.remove());

    // Add User Message
    body.innerHTML += `<div class="chat-bubble chat-user">${text}</div>`;
    body.scrollTop = body.scrollHeight;

    // Simulate typing
    const typingId = 'typing-' + Date.now();
    setTimeout(() => {
        body.innerHTML += `<div id="${typingId}" class="chat-bubble chat-bot" style="color:#888;">L'assistant rédige...</div>`;
        body.scrollTop = body.scrollHeight;
        
        setTimeout(() => {
            const t = document.getElementById(typingId);
            if(t) t.remove();
            body.innerHTML += `<div class="chat-bubble chat-bot">${FAQ_DATABASE[key] || "Je ne suis pas sûr de comprendre. Pouvez-vous contacter le support WhatsApp pour ça ?"}</div>`;
            
            setTimeout(() => {
               showOptions();
            }, 500);
            
            body.scrollTop = body.scrollHeight;
        }, 1200);

    }, 300);
}

// Initialiser le widget si le script est chargé
if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupportWidget);
} else {
    initSupportWidget();
}
