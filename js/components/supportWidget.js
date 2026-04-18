/**
 * Support Widget Component — PharmaProjet
 * Chatbot d'assistance intégré, intelligent et personnalisé
 * Ne s'affiche qu'APRÈS la connexion de l'utilisateur
 */

let supportChatOpen = false;
let _widgetInitialized = false;

function initSupportWidget() {
    if (_widgetInitialized) {
        // Widget déjà créé, juste le rendre visible
        const w = document.getElementById('support-widget-container');
        if (w) w.style.display = 'block';
        return;
    }

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
            width: 360px;
            height: 500px;
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
            line-height: 1.5;
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
            padding: 10px 12px;
            background: #fff;
            border-top: 1px solid rgba(0,0,0,0.05);
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .support-input-row {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .support-input-row input {
            flex: 1;
            border: 1px solid #ddd;
            border-radius: 20px;
            padding: 8px 14px;
            font-size: 13px;
            outline: none;
            transition: border-color 0.2s;
            font-family: inherit;
        }

        .support-input-row input:focus {
            border-color: #1B6FAE;
        }

        .support-send-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #1B6FAE;
            color: #fff;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.2s;
            flex-shrink: 0;
        }

        .support-send-btn:hover {
            background: #155a8a;
        }
        
        .whatsapp-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: #25D366;
            color: #fff;
            text-decoration: none;
            padding: 8px 14px;
            border-radius: 8px;
            font-size: 12px;
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

    // Récupérer le nom de l'utilisateur connecté
    const userName = (window.DB && DB.AppState && DB.AppState.currentUser) 
        ? DB.AppState.currentUser.name || DB.AppState.currentUser.username 
        : 'Pharmacien';
    const firstName = userName.split(' ')[0];

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
                            <div class="support-title">Naomie — Assistante PharmaProjet</div>
                            <div class="support-subtitle"><div class="support-status-dot"></div> Toujours disponible</div>
                        </div>
                    </div>
                    <button class="support-close" onclick="toggleSupportWindow()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                </div>
                <div class="support-body" id="support-chat-body">
                    <div class="chat-bubble chat-bot">
                        Bonjour <strong>${firstName}</strong> ! 👋 Je suis <strong>Naomie</strong>, votre assistante PharmaProjet. Comment puis-je vous aider aujourd'hui ?
                    </div>
                </div>
                <div class="support-footer">
                    <div class="support-input-row">
                        <input type="text" id="support-free-input" placeholder="Tapez votre question ici..." onkeydown="if(event.key==='Enter') submitFreeQuestion()">
                        <button class="support-send-btn" onclick="submitFreeQuestion()" title="Envoyer">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                        </button>
                    </div>
                    <a href="https://wa.me/224627171397?text=Bonjour%20TrillionX%2C%20j%27ai%20besoin%20d%27assistance%20avec%20PharmaProjet." target="_blank" class="whatsapp-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
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
    _widgetInitialized = true;
    showQuickOptions();
}

function hideSupportWidget() {
    const w = document.getElementById('support-widget-container');
    if (w) w.style.display = 'none';
    supportChatOpen = false;
    const sw = document.getElementById('support-window');
    if (sw) sw.classList.remove('open');
}

window.toggleSupportWindow = function() {
    const w = document.getElementById('support-window');
    const p = document.getElementById('support-pulse');
    if (supportChatOpen) {
        w.classList.remove('open');
        if (p) p.style.display = 'block';
    } else {
        w.classList.add('open');
        if (p) p.style.display = 'none';
        const oldFab = document.getElementById('support-chat-fab');
        if(oldFab) oldFab.style.display = 'none';
        // Focus sur l'input
        setTimeout(() => {
            const inp = document.getElementById('support-free-input');
            if (inp) inp.focus();
        }, 350);
    }
    supportChatOpen = !supportChatOpen;
};

// ═══════════════════════════════════════════════════════════════════
// BASE DE CONNAISSANCES FAQ — 20+ topics couvrant TOUT PharmaProjet
// ═══════════════════════════════════════════════════════════════════
const FAQ_DATABASE = [
    {
        keywords: ['dette', 'crédit', 'ardoise', 'impayé', 'doit'],
        question: 'Comment gérer les crédits / dettes ?',
        answer: "Pour créer une vente à crédit, allez dans le **Point de Vente**, choisissez le mode de paiement **« Crédit »**, puis sélectionnez une date d'échéance. Le patient doit être identifié.\n\nPour encaisser une dette, rendez-vous dans **Historique des Ventes** et cliquez sur le bouton **« Encaisser la dette »** à côté de la vente concernée. 💰"
    },
    {
        keywords: ['vente', 'annuler', 'supprimer', 'historique', 'facture', 'reçu'],
        question: 'Comment annuler ou voir une vente ?',
        answer: "Allez dans **Historique des Ventes** depuis le menu. Chaque vente a un bouton 👁️ pour voir le détail complet (reçu, articles, patient).\n\nPour annuler, cliquez sur la vente puis utilisez le bouton d'annulation. Le stock sera automatiquement réajusté. 📋"
    },
    {
        keywords: ['assurance', 'mutuelle', 'tiers', 'payant', 'prise en charge', 'couverture'],
        question: 'Comment fonctionne la prise en charge Assurance ?',
        answer: "Au **Point de Vente**, choisissez le paiement **« Assurance »**. Renseignez :\n• Le nom de l'organisme (ex: CNSS, ASCOMA)\n• La référence de prise en charge\n• Le montant couvert par l'entreprise\n\nLe système calcule automatiquement le **ticket modérateur** (part patient) et l'encaisse immédiatement. La part entreprise reste en attente de règlement. 🛡️"
    },
    {
        keywords: ['péremption', 'expiration', 'périmé', 'fefo', 'lot', 'date'],
        question: 'Comment gérer les dates de péremption ?',
        answer: "PharmaProjet utilise la méthode **FEFO** (First Expired, First Out) automatiquement ! Lors d'une vente, le lot avec la date d'expiration la plus proche est déstocké en priorité.\n\nLes alertes de péremption apparaissent dans le **Centre d'Alertes** quand un lot arrive à moins de 3 mois de sa date limite. ⏰"
    },
    {
        keywords: ['imprimante', 'bluetooth', 'ticket', 'impression', 'xprinter'],
        question: 'Comment connecter mon imprimante ?',
        answer: "Utilisez une imprimante thermique Bluetooth (ex: Xprinter). Allez dans les **paramètres Bluetooth** de votre appareil pour l'appairer.\n\nPour imprimer un reçu, validez une vente puis cliquez sur **« Imprimer »** dans la fenêtre de confirmation. Le format est optimisé pour les rouleaux de 58mm et 80mm. 🖨️"
    },
    {
        keywords: ['stock', 'inventaire', 'quantité', 'rupture', 'disponible'],
        question: 'Comment consulter et gérer le stock ?',
        answer: "Allez dans **Gestion des Stocks** pour voir tous vos produits avec leurs quantités en temps réel.\n\nVous pouvez :\n• Faire un **inventaire** pour corriger les écarts\n• Voir les **mouvements** (entrées/sorties) de chaque produit\n• Identifier les **ruptures** et **stocks bas** d'un coup d'œil\n\nLes produits en rupture sont signalés avec une pastille rouge. 📦"
    },
    {
        keywords: ['commande', 'fournisseur', 'commander', 'achat', 'réception', 'bon'],
        question: 'Comment passer une commande fournisseur ?',
        answer: "Allez dans **Fournisseurs & Achats** :\n1. Créez d'abord un fournisseur si ce n'est pas fait\n2. Cliquez sur **« Nouvelle Commande »**\n3. Ajoutez les produits et quantités\n4. Envoyez la commande\n\nÀ la livraison, cliquez **« Réceptionner »** pour valider les quantités reçues, les lots et les dates de péremption. Le stock est mis à jour automatiquement ! 📦➡️"
    },
    {
        keywords: ['déconditionnement', 'unité', 'plaquette', 'fractionner', 'comprimé', 'boîte'],
        question: 'Comment vendre à l\'unité (déconditionnement) ?',
        answer: "Dans le **Catalogue Produits**, modifiez le produit et activez **« Autoriser la vente à l'unité »**.\n\nConfigurez :\n• Nombre de sous-unités par boîte (ex: 2 plaquettes)\n• Nombre d'unités par sous-unité (ex: 10 gélules/plaquette)\n• Prix de vente par plaquette et par unité\n\nAu POS, des boutons **Boîte / Plaq. / Unité** apparaîtront automatiquement ! 💊"
    },
    {
        keywords: ['patient', 'client', 'fiche', 'dossier', 'allergie'],
        question: 'Comment gérer les dossiers patients ?',
        answer: "Allez dans **Dossiers Patients** pour créer ou consulter une fiche :\n• Nom, téléphone, adresse, sexe\n• **Allergies** — le POS vous alertera si vous ajoutez un médicament allergène !\n• Statut : Souscripteur principal ou Ayant Droit\n• Historique complet des achats et ordonnances\n\nVous pouvez aussi créer un patient **directement depuis le POS** avec le bouton '+'. 👤"
    },
    {
        keywords: ['ordonnance', 'prescription', 'médecin', 'docteur'],
        question: 'Comment créer et lier une ordonnance ?',
        answer: "Au **Point de Vente**, activez le toggle **« Ordonnance »** puis :\n1. Cliquez **« Lier une ordonnance »** pour en sélectionner une existante\n2. Ou **créez-en une nouvelle** avec le médecin prescripteur et les médicaments\n\nLes produits de l'ordonnance sont automatiquement ajoutés au panier. Le pharmacien dispose d'un bouton de **validation pharmaceutique**. 📄"
    },
    {
        keywords: ['statistique', 'tableau', 'bord', 'chiffre', 'affaire', 'marge', 'panier', 'moyen', 'pilotage'],
        question: 'Comment accéder aux statistiques ?',
        answer: "Deux vues disponibles :\n\n📊 **Tableau de Bord** : Vue globale avec les KPIs du jour (CA, nombre de ventes, top produits, graphiques)\n\n📈 **Pilotage** : Analyses détaillées avec le **Panier Moyen**, la **Marge Nette**, le **CA par période**, les **tendances de ventes** et la **répartition financière**.\n\nExportez vos rapports en un clic ! 🎯"
    },
    {
        keywords: ['sauvegarde', 'backup', 'restaurer', 'données', 'json'],
        question: 'Comment sauvegarder mes données ?',
        answer: "Allez dans **Paramètres > Synchronisation** :\n\n💾 **Sauvegarde locale** : Cliquez « Sauvegarder maintenant » pour télécharger un fichier JSON contenant toutes vos données.\n\n☁️ **Cloud (Supabase)** : Si configuré, vos données se synchronisent automatiquement. Pensez à faire un **PULL** régulièrement pour récupérer les données des autres appareils !"
    },
    {
        keywords: ['synchronisation', 'sync', 'cloud', 'supabase', 'pull', 'push', 'appareil', 'mobile'],
        question: 'Comment synchroniser entre plusieurs appareils ?',
        answer: "PharmaProjet fonctionne en mode **offline-first** :\n\n1. Configurez Supabase dans **Paramètres > Appareil & Cloud**\n2. Les données se **PUSH** (envoient) automatiquement\n3. Faites un **PULL** (dans Paramètres) pour récupérer les données d'un autre appareil\n\n⚠️ Pensez à faire un PULL chaque semaine si vous travaillez hors-ligne depuis longtemps ! 🔄"
    },
    {
        keywords: ['caisse', 'clôture', 'journée', 'encaissement', 'espèce', 'orange money'],
        question: 'Comment fonctionne la caisse ?',
        answer: "La **Caisse** affiche en temps réel :\n• Le total des ventes du jour\n• La répartition par mode de paiement (Espèces, Orange Money, MTN MoMo)\n• Les ventes à crédit et les couvertures assurance\n• Le montant total en attente de règlement\n\nChaque vente du jour est listée avec ses détails. C'est votre tableau de bord financier quotidien ! 💵"
    },
    {
        keywords: ['alerte', 'notification', 'rupture', 'stock bas', 'centre'],
        question: 'Comment fonctionnent les alertes ?',
        answer: "Le **Centre d'Alertes** détecte automatiquement :\n\n🔴 **Ruptures de stock** : Produits à 0 unité\n🟡 **Stock bas** : En dessous du seuil configuré\n⏰ **Péremptions proches** : Lots expirant dans les 3 prochains mois\n\nLes alertes sont triées par priorité et vous pouvez les filtrer. Le badge rouge dans le menu indique le nombre d'alertes non lues. 🔔"
    },
    {
        keywords: ['interaction', 'médicament', 'contre-indication', 'allergie', 'combinaison'],
        question: 'Comment sont gérées les interactions médicamenteuses ?',
        answer: "PharmaProjet vérifie automatiquement les **30 interactions critiques** les plus courantes à chaque ajout au panier !\n\n🚨 **Grave** : Alerte rouge (ex: Warfarine + Aspirine = Hémorragie)\n⚠️ **Modéré** : Alerte orange (ex: Fer + Ciprofloxacine = Absorption réduite)\n\nDe plus, si le patient a des **allergies** renseignées, le POS vous alertera immédiatement. 💊"
    },
    {
        keywords: ['sms', 'message', 'envoi', 'africastalking', 'rappel'],
        question: 'Comment envoyer des SMS aux patients ?',
        answer: "Configurez le service SMS dans **Paramètres > Configuration SMS** :\n1. Choisissez le fournisseur (AfricasTalking recommandé)\n2. Entrez votre clé API et l'expéditeur\n3. Testez avec le bouton « Tester l'envoi »\n\nVous pouvez ensuite envoyer des rappels de dette, des notifications de commande prête, etc. 📱"
    },
    {
        keywords: ['notice', 'rcp', 'posologie', 'effet', 'indésirable', 'précaution'],
        question: 'Comment consulter la notice d\'un médicament ?',
        answer: "Deux façons d'accéder à la notice :\n\n1. **Au POS** : Cliquez le bouton **ℹ️** sur la carte du produit ou dans le panier\n2. **Au Catalogue** : Ouvrez la fiche du produit\n\nLa notice affiche : Posologie, Précautions d'emploi, Contre-indications, Effets indésirables et le RCP complet. Vous pouvez aussi télécharger le PDF du laboratoire si disponible. 📖"
    },
    {
        keywords: ['menu', 'navigation', 'accès', 'section', 'module', 'page', 'aller', 'trouver', 'ouvrir'],
        question: 'Comment naviguer dans le menu ?',
        answer: "Le menu principal contient toutes les sections de PharmaProjet :\n\n🛒 **Point de Vente (POS)** — Faire une vente\n📦 **Gestion des Stocks** — Consulter et ajuster les stocks\n💊 **Catalogue Produits** — Gérer le catalogue médicaments\n👤 **Dossiers Patients** — Fiches et historiques patients\n📋 **Historique des Ventes** — Toutes les ventes effectuées\n🚚 **Fournisseurs & Achats** — Commandes et réceptions\n💰 **Caisse** — Encaissements du jour\n📊 **Tableau de Bord** — KPIs en temps réel\n📈 **Pilotage** — Analyses avancées\n🔔 **Alertes** — Ruptures et péremptions\n⚙️ **Paramètres** — Configuration complète"
    },
    {
        keywords: ['retour', 'remboursement', 'échange', 'renvoyer', 'rendre', 'retourné'],
        question: 'Comment gérer un retour de médicament ?',
        answer: "Allez dans **Historique des Ventes** et trouvez la vente concernée.\n\nCliquez sur le bouton **« Retour »** 🔄. Vous pouvez :\n• Retourner **tout** ou **une partie** des articles\n• Choisir le **motif** du retour (erreur, péremption, contre-indication)\n• Choisir le **mode de remboursement** (Espèces, Mobile Money, Avoir)\n\nLe stock est automatiquement réajusté à la hausse après validation. ✅"
    },
    {
        keywords: ['produit', 'médicament', 'ajouter', 'créer', 'catalogue', 'référence', 'nouveau'],
        question: 'Comment ajouter un nouveau médicament ?',
        answer: "Allez dans **Catalogue Produits** et cliquez **« + Nouveau Produit »** :\n\n📝 Renseignez :\n• Nom commercial, DCI (molécule), Marque\n• Forme (comprimé, sirop, injection...)\n• **Prix d'achat** et **prix de vente**\n• Stock minimum de sécurité\n• Doses, précautions, notice médicale (optionnels)\n\nN'oubliez pas de configurer les **lots et dates de péremption** dans la section stock après ! 💊"
    },
    {
        keywords: ['utilisateur', 'employé', 'rôle', 'pharmacien', 'caissier', 'accès', 'compte', 'mot de passe'],
        question: 'Comment gérer les accès utilisateurs ?',
        answer: "Allez dans **Paramètres > Utilisateurs** (accès réservé au Manager/Admin) :\n\n👤 Vous pouvez créer des comptes avec différents rôles :\n• **Manager** — Accès complet (ventes, stocks, rapports, paramètres)\n• **Pharmacien** — Ventes, consultation stocks, patients\n• **Caissier** — Point de vente uniquement\n\nChaque connexion est **tracée dans l'audit** : qui a fait quoi et quand. 🔐"
    },
    {
        keywords: ['paramètre', 'configuration', 'pharmacie', 'nom', 'logo', 'adresse', 'devise', 'monnaie'],
        question: 'Comment configurer les paramètres de la pharmacie ?',
        answer: "Allez dans **⚙️ Paramètres** puis :\n\n🏥 **Informations Pharmacie** : Nom, adresse, téléphone, numéro d'agrément, logo (affiché sur les reçus)\n💱 **Devise** : Choisissez votre monnaie locale (GNF, XOF, MAD...)\n🖨️ **Impression** : Format du reçu, texte de pied de page\n📱 **SMS** : Configuration du service d'envoi SMS\n☁️ **Cloud** : Clés Supabase pour la synchro multi-appareils\n\nTous les changements s'enregistrent et se synchronisent automatiquement. ⚙️"
    },
    {
        keywords: ['mouvement', 'entrée', 'sortie', 'tracabilité', 'historique stock', 'journal'],
        question: 'Comment voir les mouvements de stock ?',
        answer: "Dans **Gestion des Stocks**, cliquez sur un produit puis sur **« Mouvements »** :\n\nVous verrez toutes les entrées et sorties :\n📥 **Entrée** — Réception fournisseur, ajustement inventaire\n📤 **Sortie** — Vente, perte, destruction\n🔄 **Ajustement** — Correction manuelle après inventaire\n\nChaque mouvement indique la date, l'utilisateur et la raison. C'est votre traçabilité complète pour les contrôles ! 📋"
    },
];

const GREETINGS = [
    "Bien sûr ! Voici ce que je peux vous dire :",
    "Excellente question ! 😊",
    "Avec plaisir, voici la réponse :",
    "Je vais vous expliquer ça tout de suite 👇",
    "Bonne question ! Voici comment faire :",
    "Je suis là pour ça ! Voici l'info :",
];

function getGreeting() {
    return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

function getUserName() {
    if (window.DB && DB.AppState && DB.AppState.currentUser) {
        return DB.AppState.currentUser.name || DB.AppState.currentUser.username || 'Pharmacien';
    }
    return 'Pharmacien';
}

function matchFAQ(input) {
    const q = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let bestMatch = null;
    let bestScore = 0;

    for (const entry of FAQ_DATABASE) {
        let score = 0;
        for (const kw of entry.keywords) {
            const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (q.includes(kwNorm)) {
                score += kwNorm.length; // Weight by keyword length (more specific = higher score)
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = entry;
        }
    }

    return bestScore >= 3 ? bestMatch : null;
}

function showQuickOptions() {
    const body = document.getElementById('support-chat-body');
    if (!body) return;
    const acts = document.createElement('div');
    acts.className = 'support-actions';
    // Afficher les 6 sujets les plus fréquents
    const quickTopics = [
        { label: '🗺️ Naviguer dans le menu', idx: 18 },
        { label: '💳 Crédits & Dettes', idx: 0 },
        { label: '🚚 Commander des produits', idx: 6 },
        { label: '📦 Gérer le stock', idx: 5 },
        { label: '🔄 Retours', idx: 19 },
        { label: '📊 Statistiques', idx: 10 },
        { label: '🛡️ Assurance', idx: 2 },
        { label: '🔄 Synchronisation', idx: 12 },
    ];
    acts.innerHTML = quickTopics.map(t => 
        `<button class="support-btn" onclick="askByIndex(${t.idx})">${t.label}</button>`
    ).join('');
    body.appendChild(acts);
    body.scrollTop = body.scrollHeight;
}

window.askByIndex = function(idx) {
    const entry = FAQ_DATABASE[idx];
    if (!entry) return;
    askQuestion(entry.question, entry);
};

// ═══════════════════════════════════════════════════════════════════
// CONVERSATION NATURELLE — Réponses sans API IA
// ═══════════════════════════════════════════════════════════════════
const CONVERSATIONS = [
    {
        triggers: ['bonjour', 'bonsoir', 'salut', 'hello', 'hi', 'hey', 'coucou', 'yo'],
        responses: [
            "Bonjour {name} ! 😊 Comment puis-je vous aider aujourd'hui ? N'hésitez pas à me poser une question ou cliquez sur un sujet ci-dessous !",
            "Salut {name} ! 👋 Ravie de vous revoir ! Que puis-je faire pour vous ?",
            "Bonjour {name} ! 🌟 Je suis Naomie, votre assistante. Dites-moi ce dont vous avez besoin !",
        ]
    },
    {
        triggers: ['merci', 'remercie', 'thanks', 'thank', 'top', 'parfait', 'genial', 'super', 'excellent', 'bravo', 'nickel'],
        responses: [
            "Avec plaisir, {name} ! 😊 N'hésitez pas si vous avez d'autres questions !",
            "Je suis ravie d'avoir pu vous aider, {name} ! 💙 À votre service !",
            "De rien ! C'est mon rôle de vous accompagner, {name} ! 🌟 Autre chose ?",
        ]
    },
    {
        triggers: ['au revoir', 'bye', 'a bientot', 'a plus', 'bonne journee', 'bonne soiree', 'adieu'],
        responses: [
            "À bientôt {name} ! 👋 Bonne continuation et n'hésitez pas à revenir !",
            "Au revoir {name} ! 😊 Passez une excellente journée ! À très vite !",
            "À la prochaine {name} ! 💙 Je suis toujours là si besoin !",
        ]
    },
    {
        triggers: ['ca va', 'comment vas', 'comment tu vas', 'comment ca', 'la forme', 'quoi de neuf', 'comment allez'],
        responses: [
            "Je vais très bien, merci {name} ! 😊 Et vous ? Prêt(e) à conquérir la journée ? Dites-moi comment je peux vous aider !",
            "Toujours au top, {name} ! 💪 Je suis disponible 24h/24 pour vous. Que puis-je faire ?",
            "Je suis en pleine forme ! 🌟 Merci de demander, {name}. Comment puis-je vous assister aujourd'hui ?",
        ]
    },
    {
        triggers: ['qui es tu', 'c est quoi', 'tu es qui', 'ton nom', 'tu fais quoi', 'tu sers a quoi', 'quel est ton role'],
        responses: [
            "Je suis <strong>Naomie</strong>, votre assistante virtuelle PharmaProjet ! 🤖💙<br><br>Je suis conçue pour vous guider dans l'utilisation complète de l'application : ventes, stocks, patients, fournisseurs, analyses financières...<br><br>Je connais <strong>plus de 25 sujets</strong> à fond ! Posez-moi n'importe quelle question, et si je ne sais pas répondre, je vous oriente vers le support humain via WhatsApp. 😊",
        ]
    },
    {
        triggers: ['aide', 'help', 'besoin d aide', 'aider', 'comment faire', 'je ne sais pas', 'je comprends pas'],
        responses: [
            "Bien sûr {name}, je suis là pour ça ! 💙<br><br>Dites-moi ce que vous cherchez à faire, ou cliquez sur l'un des sujets ci-dessous pour obtenir une réponse détaillée :",
        ]
    },
    {
        triggers: ['oui', 'ok', 'daccord', 'd accord', 'entendu', 'compris', 'je vois', 'ah ok', 'bien'],
        responses: [
            "Parfait {name} ! 👍 Autre chose que je peux faire pour vous ?",
            "Super ! 😊 N'hésitez pas si une autre question vous vient à l'esprit !",
        ]
    },
    {
        triggers: ['non', 'pas besoin', 'rien', 'c est bon', 'c est tout', 'rien d autre'],
        responses: [
            "D'accord {name} ! 😊 Je reste ici si jamais vous avez besoin. Bonne continuation ! 💙",
            "Très bien ! N'hésitez pas à revenir quand vous voulez, {name}. Je suis toujours disponible ! 🌟",
        ]
    },
    {
        triggers: ['blague', 'rire', 'drole', 'humour', 'joke', 'raconte moi', 'amuse moi', 'ennui', 'je m ennuie'],
        responses: [
            "😄 Pourquoi le pharmacien est-il toujours calme ? Parce qu'il a toujours la bonne <strong>dose</strong> de patience ! 💊<br><br>Bon, trêve de plaisanterie, {name}, je suis prête à travailler !",
            "😂 Un patient demande au pharmacien : « Avez-vous quelque chose contre le stress ? » — « Oui, ma démission ! » 😆<br><br>Allez {name}, je suis là pour vous faciliter la vie !",
            "🤣 Quelle est la différence entre un pharmacien et un magicien ? Le pharmacien fait disparaître votre argent, le magicien fait disparaître un lapin ! 🐇<br><br>Plus sérieusement, {name}, comment puis-je vous aider ?",
        ]
    },
    {
        triggers: ['prix', 'combien coute', 'tarif', 'cout', 'abonnement', 'gratuit', 'licence', 'payer'],
        responses: [
            "PharmaProjet fonctionne sur modèle <strong>SaaS</strong> (Software as a Service). 💼<br><br>Pour les détails de tarification et les plans disponibles, contactez directement l'équipe <strong>TrillionX</strong> via WhatsApp ci-dessous. Ils vous feront une offre adaptée à votre pharmacie ! 📞",
        ]
    },
    {
        triggers: ['probleme', 'bug', 'erreur', 'marche pas', 'fonctionne pas', 'plante', 'crash', 'bloque', 'lent'],
        responses: [
            "Oh non, {name} ! 😟 Essayons de résoudre ça ensemble :<br><br>🔄 <strong>Étape 1</strong> : Rafraîchissez la page (Ctrl+Shift+R)<br>📱 <strong>Étape 2</strong> : Si c'est sur mobile, fermez et rouvrez l'app<br>💾 <strong>Étape 3</strong> : Allez dans Paramètres > Sauvegarde pour vérifier vos données<br><br>Si le problème persiste, contactez le <strong>support TrillionX</strong> via WhatsApp avec une capture d'écran de l'erreur. 🛠️",
        ]
    },
    {
        triggers: ['heure', 'quelle heure', 'date', 'quel jour', 'aujourd hui'],
        responses: [
            "Il est <strong>{time}</strong>, {name} ! ⏰<br>Nous sommes le <strong>{date}</strong>.<br><br>Bonne continuation dans votre journée de travail ! 💪",
        ]
    },
    {
        triggers: ['tu es belle', 'je t aime', 'jolie', 'mignonne', 'intelligente', 'geniale', 'formidable'],
        responses: [
            "Oh merci {name}, vous êtes trop gentil(le) ! 😊💙 Je suis juste un programme, mais ça me fait quand même plaisir ! Allez, revenons au travail — comment puis-je vous aider ?",
            "Aww, {name} ! 🥰 C'est adorable ! Mais ma vraie beauté, c'est mes <strong>25+ sujets de connaissance</strong> sur la gestion de pharmacie ! Posez-moi une question, vous allez voir ! 😎",
        ]
    },
    {
        triggers: ['motivation', 'courage', 'fatigue', 'stress', 'dur', 'difficile', 'epuise'],
        responses: [
            "Courage {name} ! 💪🌟<br><br>Rappelez-vous : chaque ordonnance que vous servez, chaque patient que vous conseillez, <strong>vous changez des vies</strong>. Le métier de pharmacien est noble et essentiel.<br><br>Prenez une pause si nécessaire, et je serai là quand vous reviendrez ! ☕",
            "Hey {name}, chaque grande pharmacie a été construite jour après jour ! 🏗️<br><br>Vous faites un travail remarquable. Et avec PharmaProjet, tout est automatisé pour vous libérer du temps. Utilisez-le pour vous reposer ! 😊💙",
        ]
    },
    {
        triggers: ['conseil', 'astuce', 'tips', 'recommandation', 'suggestion', 'ameliorer'],
        responses: [
            "Voici mes <strong>top astuces</strong> pour optimiser votre pharmacie, {name} ! 🎯<br><br>1️⃣ <strong>Scannez les codes-barres</strong> au POS — c'est 3x plus rapide<br>2️⃣ <strong>Configurez les alertes de stock</strong> pour ne jamais être en rupture<br>3️⃣ <strong>Utilisez les statistiques</strong> (Pilotage) pour identifier vos best-sellers<br>4️⃣ <strong>Faites un PULL cloud</strong> chaque semaine pour sécuriser vos données<br>5️⃣ <strong>Créez des fiches patients</strong> — les allergies sauvent des vies ! 💊",
        ]
    },
    {
        triggers: ['concurrent', 'meditect', 'comparaison', 'autre logiciel', 'alternative', 'mieux'],
        responses: [
            "PharmaProjet se distingue sur plusieurs points clés, {name} ! 🏆<br><br>✅ <strong>Offline-first</strong> — Fonctionne sans internet (essentiel en Afrique)<br>✅ <strong>FEFO automatique</strong> — Gestion des lots et péremptions en temps réel<br>✅ <strong>Multi-appareils</strong> — Synchronisation cloud entre PC et mobile<br>✅ <strong>Interactions médicamenteuses</strong> — 30+ alertes critiques intégrées<br>✅ <strong>Mobile Money</strong> — Orange Money, MTN MoMo natifs<br><br>Peu de solutions offrent tout ça sur le marché africain ! 💎",
        ]
    },
];


function matchConversation(input) {
    const q = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['']/g, ' ');
    for (const conv of CONVERSATIONS) {
        for (const trigger of conv.triggers) {
            const trigNorm = trigger.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (q.includes(trigNorm)) {
                return conv.responses[Math.floor(Math.random() * conv.responses.length)];
            }
        }
    }
    return null;
}

window.submitFreeQuestion = function() {
    const input = document.getElementById('support-free-input');
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    input.value = '';

    const body = document.getElementById('support-chat-body');
    if (!body) return;
    const oldActs = body.querySelectorAll('.support-actions');
    oldActs.forEach(e => e.remove());
    body.innerHTML += `<div class="chat-bubble chat-user">${text}</div>`;
    body.scrollTop = body.scrollHeight;

    // 1. Chercher dans la FAQ
    const match = matchFAQ(text);
    if (match) {
        askQuestion(text, match);
        return;
    }

    // 2. Chercher dans la conversation naturelle
    const convReply = matchConversation(text);
    const typingId = 'typing-' + Date.now();

    setTimeout(() => {
        body.innerHTML += `<div id="${typingId}" class="chat-bubble chat-bot" style="color:#888;">Naomie réfléchit...</div>`;
        body.scrollTop = body.scrollHeight;
        const delay = 600 + Math.random() * 500;
        setTimeout(() => {
            const t = document.getElementById(typingId);
            if(t) t.remove();
            const name = getUserName().split(' ')[0];

            if (convReply) {
                // Réponse conversationnelle avec variables dynamiques
                const now = new Date();
                const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                const reply = convReply
                    .replace(/\{name\}/g, name)
                    .replace(/\{time\}/g, timeStr)
                    .replace(/\{date\}/g, dateStr);
                body.innerHTML += `<div class="chat-bubble chat-bot">${reply}</div>`;
                setTimeout(() => showQuickOptions(), 400);
            } else {
                // Aucun match — réponse intelligente contextuelle
                const page = window.location.hash?.replace('#','') || 'dashboard';
                const pageHints = {
                    'pos': 'Je vois que vous êtes au <strong>Point de Vente</strong>. Besoin d\'aide pour scanner un produit, gérer un crédit ou une assurance ?',
                    'products': 'Vous êtes dans le <strong>Catalogue Produits</strong>. Besoin d\'aide pour ajouter un médicament ou configurer le déconditionnement ?',
                    'stock': 'Vous êtes dans la <strong>Gestion des Stocks</strong>. Besoin d\'aide pour un inventaire ou voir les mouvements ?',
                    'patients': 'Vous êtes dans les <strong>Dossiers Patients</strong>. Besoin d\'aide pour créer une fiche ou gérer les allergies ?',
                    'suppliers': 'Vous êtes dans <strong>Fournisseurs & Achats</strong>. Besoin d\'aide pour créer une commande ou réceptionner une livraison ?',
                    'sales': 'Vous êtes dans l\'<strong>Historique des Ventes</strong>. Besoin d\'aide pour encaisser une dette ou faire un retour ?',
                };
                const hint = pageHints[page] || 'Dites-moi ce que vous cherchez à faire, et je vous guiderai !';
                body.innerHTML += `<div class="chat-bubble chat-bot">Hmm, je n'ai pas trouvé de réponse exacte à "<strong>${text}</strong>", ${name}. 🤔<br><br>${hint}<br><br>Vous pouvez aussi :<br>• Reformuler avec un mot-clé (<strong>stock</strong>, <strong>crédit</strong>, <strong>commande</strong>...)<br>• Cliquer un sujet ci-dessous<br>• Contacter le support humain via WhatsApp 👇</div>`;
                setTimeout(() => showQuickOptions(), 400);
            }
            body.scrollTop = body.scrollHeight;
        }, delay);
    }, 300);
};

function askQuestion(text, faqEntry) {
    const body = document.getElementById('support-chat-body');
    if (!body) return;

    const oldActs = body.querySelectorAll('.support-actions');
    oldActs.forEach(e => e.remove());

    body.innerHTML += `<div class="chat-bubble chat-user">${text}</div>`;
    body.scrollTop = body.scrollHeight;

    const typingId = 'typing-' + Date.now();
    setTimeout(() => {
        body.innerHTML += `<div id="${typingId}" class="chat-bubble chat-bot" style="color:#888;">Naomie rédige...</div>`;        body.scrollTop = body.scrollHeight;
        
        // Délai réaliste variant entre 800ms et 1500ms
        const delay = 800 + Math.random() * 700;
        setTimeout(() => {
            const t = document.getElementById(typingId);
            if(t) t.remove();

            const greeting = getGreeting();
            // Convertir le markdown simple en HTML
            const htmlAnswer = faqEntry.answer
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');

            body.innerHTML += `<div class="chat-bubble chat-bot">${greeting}<br><br>${htmlAnswer}</div>`;
            
            setTimeout(() => {
                showQuickOptions();
            }, 500);
            
            body.scrollTop = body.scrollHeight;
        }, delay);

    }, 300);
}

window.askQuestion = askQuestion;

// Exposer les fonctions globales
window.initSupportWidget = initSupportWidget;
window.hideSupportWidget = hideSupportWidget;
